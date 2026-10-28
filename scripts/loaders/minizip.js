










(function(){
  'use strict';

  const SIG_EOCD = 0x06054b50;   
  const SIG_CEN  = 0x02014b50;   
  const SIG_LOC  = 0x04034b50;   

  function readU16(view, off){ return view.getUint16(off, true); }
  function readU32(view, off){ return view.getUint32(off, true); }

  function findEOCD(buf){
    const bytes = new Uint8Array(buf);
    const maxComment = 0xFFFF; 
    const scanStart = Math.max(0, bytes.length - (22 + maxComment));
    for (let i = bytes.length - 22; i >= scanStart; i--) {
      if (bytes[i] === 0x50 && bytes[i+1] === 0x4b && bytes[i+2] === 0x05 && bytes[i+3] === 0x06) {
        const view = new DataView(buf, i, 22);
        const sig = readU32(view, 0);
        if (sig !== SIG_EOCD) continue;
        const totalEntries = readU16(view, 10);
        const cdSize       = readU32(view, 12);
        const cdOffset     = readU32(view, 16);
        const commentLen   = readU16(view, 20);
        if (i + 22 + commentLen !== bytes.length) continue;
        return { totalEntries, cdSize, cdOffset, eocdOffset: i, commentLen };
      }
    }
    throw new Error('EOCD not found in ZIP');
  }

  function parseCentralDirectory(buf, cdOffset, totalEntries){
    const entries = [];
    let off = cdOffset;
    const view = new DataView(buf);
    const td = new TextDecoder('utf-8', { fatal: false });
    for (let i = 0; i < totalEntries; i++) {
      const sig = view.getUint32(off, true); if (sig !== SIG_CEN) throw new Error('Invalid central dir signature');
      
      const verMade   = view.getUint16(off + 4, true);
      const verNeed   = view.getUint16(off + 6, true);
      const flags     = view.getUint16(off + 8, true);
      const method    = view.getUint16(off + 10, true);
      
      const crc32     = view.getUint32(off + 16, true);
      const compSize  = view.getUint32(off + 20, true);
      const uncomp    = view.getUint32(off + 24, true);
      const nameLen   = view.getUint16(off + 28, true);
      const extraLen  = view.getUint16(off + 30, true);
      const commLen   = view.getUint16(off + 32, true);
      const diskStart = view.getUint16(off + 34, true);
      const intAttr   = view.getUint16(off + 36, true);
      const extAttr   = view.getUint32(off + 38, true);
      const lho       = view.getUint32(off + 42, true); 

      const nameBytes = new Uint8Array(buf, off + 46, nameLen);
      let name = '';
      try {
        name = td.decode(nameBytes);
      } catch(_) {
        
        name = Array.from(nameBytes).map(b=>String.fromCharCode(b)).join('');
      }
      
      off += 46 + nameLen + extraLen + commLen;

      entries.push({ name, flags, method, compSize, uncomp, crc32, localHeaderOffset: lho });
    }
    return entries;
  }

  function computeDataOffset(buf, localHeaderOffset){
    const view = new DataView(buf);
    const sig = view.getUint32(localHeaderOffset + 0, true);
    if (sig !== SIG_LOC) throw new Error('Invalid local header signature');
    const nameLen  = view.getUint16(localHeaderOffset + 26, true);
    const extraLen = view.getUint16(localHeaderOffset + 28, true);
    return localHeaderOffset + 30 + nameLen + extraLen;
  }

  async function inflateRaw(deflateBuf){
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Compressed entries require DecompressionStream("deflate-raw"), which is not supported in this browser.');
    }
    const rs = new Response(deflateBuf).body;
    const ds = rs.pipeThrough(new DecompressionStream('deflate-raw'));
    const ab = await new Response(ds).arrayBuffer();
    return ab;
  }

  function buildFs(buf, entries){
    
    function Dir(name, parent){ this.name = name; this.parent = parent||null; this.directory = true; this.children = []; }
    Dir.prototype.getChildByName = function(name){
      
      if (!name) return null;
      const parts = String(name).replace(/\\/g,'/').split('/');
      let node = this;
      for (let i = 0; i < parts.length; i++){
        const part = parts[i]; if (!part) continue;
        const next = node.children.find(c => c.name === part) || node.children.find(c => c.name.toLowerCase() === part.toLowerCase());
        if (!next) return null; node = next;
      }
      return node;
    };
    Dir.prototype.getFullname = function(){ return this.parent ? (this.parent.getFullname() + this.name + '/') : ''; };

    function File(node){
      Object.assign(this, node);
      this.directory = false;
    }
    File.prototype.getFullname = function(){ return this.parent ? (this.parent.getFullname() + this.name) : this.name; };
    File.prototype.getBlob = function(mime, cb){
      const onerror = arguments[2];
      const mimeType = mime || 'application/octet-stream';
      const dataStart = this._dataOffset;
      const dataEnd = dataStart + this._compSize;
      const slice = new Uint8Array(this._buffer, dataStart, this._compSize).slice().buffer; 
      const done = blob => cb && cb(blob);
      const fail = error => { if (onerror) onerror(error); else { console.error('ZIP extraction failed:', this.name, error); done(null); } };
      if (this._method === 0) {
        done(new Blob([slice], { type: mimeType }));
      } else if (this._method === 8) {
        inflateRaw(slice).then(ab => done(new Blob([ab], { type: mimeType }))).catch(err => {
          fail(new Error('Could not decompress ' + this.name + '. Please use a current browser.'));
        });
      } else {
        fail(new Error('Unsupported ZIP compression method for ' + this.name));
      }
    };
    File.prototype.getText = function(cb, onerror){
      this.getBlob('text/plain', async (blob)=>{
        if (!blob) { cb && cb(''); return; }
        try {
          const text = await blob.text();
          cb && cb(text);
        } catch (e){ if (onerror) onerror(e); else { console.warn('text() failed', e); cb && cb(''); } }
      }, onerror);
    };

    const root = new Dir('', null);

    
    for (const ent of entries){
      const isDir = ent.name.endsWith('/');
      const parts = ent.name.replace(/\\/g,'/').split('/').filter(Boolean);
      let parent = root;
      for (let i = 0; i < parts.length; i++){
        const part = parts[i];
        const isLast = (i === parts.length - 1);
        if (isLast && !isDir) {
          
          const dataOffset = computeDataOffset(buf, ent.localHeaderOffset);
          const node = new File({ name: part, parent, _buffer: buf, _dataOffset: dataOffset, _method: ent.method, _compSize: ent.compSize, _uncomp: ent.uncomp });
          parent.children.push(node);
        } else {
          
          let next = parent.children.find(c => c.directory && c.name === part);
          if (!next) { next = new Dir(part, parent); parent.children.push(next); }
          parent = next;
        }
      }
    }

    
    return root;
  }

  async function importArrayBuffer(buf){
    const eocd = findEOCD(buf);
    const list = parseCentralDirectory(buf, eocd.cdOffset, eocd.totalEntries);
    if (list.length > 15000 || list.reduce((total, entry) => total + entry.uncomp, 0) > 700 * 1024 * 1024) {
      throw new Error('This beatmap archive is too large to expand safely in the browser.');
    }
    const root = buildFs(buf, list);
    return root;
  }

  function makeFS(){
    function FS(){ this.root = makeRoot(); }
    function makeRoot(){
      const root = { children: [], directory: true };
      root.importBlob = function(blob, onend, onerror){
        (blob.arrayBuffer ? blob.arrayBuffer() : new Response(blob).arrayBuffer())
          .then(importArrayBuffer)
          .then((r)=>{
            try {
              
              Object.setPrototypeOf(root, Object.getPrototypeOf(r));
            } catch(_) {}
            
            root.name = r.name || '';
            root.parent = r.parent || null;
            root.directory = true;
            root.children = r.children || [];
            onend && onend();
          })
          .catch((err)=>{ console.error('ZIP import failed:', err); onerror && onerror(err); });
      };
      root.getFullname = function(){ return ''; };
      return root;
    }
    return FS;
  }

  
  window.zip = window.zip || {};
  window.zip.fs = window.zip.fs || {};
  window.zip.fs.FS = makeFS();

})();

