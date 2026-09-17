/* Shared server race: local animation never mints points. */
(function (root) {
  "use strict";
  function validRace(race) {
    return !!race && typeof race.id === "string" && race.id.length > 0 && race.id.length <= 80 &&
      Number.isFinite(race.started_at) && race.started_at > 0 && Number.isFinite(race.server_now) &&
      race.finish_at-race.started_at === 23000 && race.ends_at-race.started_at === 42000 &&
      race.bonus_points === 1 && Array.isArray(race.roster) && race.roster.every(function(row){
        return row && typeof row.agent === "string" && typeof row.reference === "string";
      });
  }
  function create(options) {
    var fetcher=options.fetch, race=null, receipt=null, generation=0, pending=false, retryAt=0;
    var key=options.key || function(value){return String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");};
    function post(body) {
      return fetcher(options.endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(10000)})
        .then(function(response){if(!response.ok)throw new Error("race_unavailable");return response.json();});
    }
    return {
      start:function(){
        var version=++generation; race=null;receipt=null;pending=false;retryAt=0;
        return post({action:"start"}).then(function(result){
          if(version!==generation || !result.ok || !validRace(result.race))return null;
          race=result.race; return race;
        }).catch(function(){return null;});
      },
      order:function(agent,reference){
        if(!race)return null;
        var index=race.roster.findIndex(function(row){return key(row.agent)===agent && row.reference===reference;});
        return index<0 ? 999 : index+1;
      },
      finish:function(agent,reference){
        if(!race || !race.roster[0] || key(race.roster[0].agent)!==agent || race.roster[0].reference!==reference)
          return Promise.resolve(null);
        if(receipt)return Promise.resolve(receipt);
        if(pending || Date.now()<retryAt)return Promise.resolve(null);
        var version=generation, id=race.id;pending=true;
        return post({action:"finish",race_id:id}).then(function(result){
          if(version!==generation)return null;
          if(result.ok && result.awarded && result.points===1 && result.race_id===id &&
              result.mission_id===reference.split(":")[0] && key(result.agent)===agent)receipt=result;
          else retryAt=Date.now()+5000;
          return receipt;
        }).catch(function(){if(version===generation)retryAt=Date.now()+5000;return null;})
          .finally(function(){if(version===generation)pending=false;});
      }
    };
  }
  root.YkRaceBonus={create:create};
  if(typeof module!=="undefined" && module.exports)module.exports=root.YkRaceBonus;
})(typeof globalThis!=="undefined"?globalThis:this);
