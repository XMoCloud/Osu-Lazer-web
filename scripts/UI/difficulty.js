/* Colour anchors from ppy/osu OsuColour.cs, not broad pastel difficulty buckets. */
(() => {
  const anchors=[[.1,'4290fb'],[1.25,'4fc0ff'],[2,'4fffd5'],[2.5,'7cff4f'],[3.3,'f6f05c'],[4.2,'ff8068'],[4.9,'ff4e6f'],[5.8,'c645b8'],[6.7,'6563de'],[7.7,'18158e'],[9,'000000']];
  const rgb=hex=>[0,2,4].map(index=>parseInt(hex.slice(index,index+2),16));
  function colour(stars){
    if(stars==null || !Number.isFinite(Number(stars)))return '#aaaaaa';
    const rating=Number(stars);
    if(rating<=anchors[0][0])return '#'+anchors[0][1];
    for(let i=1;i<anchors.length;i++){
      if(rating>anchors[i][0])continue;
      const left=anchors[i-1],right=anchors[i],fraction=(rating-left[0])/(right[0]-left[0]);
      const a=rgb(left[1]),b=rgb(right[1]);
      return '#'+a.map((value,index)=>Math.round(value+(b[index]-value)*fraction).toString(16).padStart(2,'0')).join('');
    }
    return '#000000';
  }
  window.osuDifficulty={colour,apply(node,stars){node.style.setProperty('--difficulty',colour(stars));node.classList.toggle('darkDifficulty',Number(stars)>=6.7);return node;}};
})();
