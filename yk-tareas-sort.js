(function(root){
  "use strict";

  var KEYS=["agent","project","mission","tasks","state"];
  var STATUS_RANK={unassigned:0,pending:1,in_progress:2,resolved:3,cancelled:4};
  var TASK_RANK={pending:0,in_progress:1,done:2};
  var collator=new Intl.Collator("es",{numeric:true,sensitivity:"base"});

  function text(value){return String(value==null?"":value).trim();}
  function ms(value){var n=Number(value)||0;return n>4102444800?n:n*1000;}
  function cmp(a,b){
    if(typeof a==="number"&&typeof b==="number")return a<b?-1:a>b?1:0;
    return collator.compare(text(a),text(b));
  }
  function compareTuple(a,b){
    for(var i=0;i<Math.max(a.length,b.length);i++){var result=cmp(a[i],b[i]);if(result)return result;}
    return 0;
  }
  function latest(group){
    var mission=group.mission||{},last=ms(mission.resolved_at)||ms(mission.updated_at)||ms(mission.created_at);
    (group.tasks||[]).forEach(function(task){last=Math.max(last,ms(task.updated_at));});
    return last;
  }
  function taskProgress(group){
    var mission=group.mission||{},tasks=(group.tasks||[]).filter(function(task){return /^[a-c]$/i.test(text(task.code));});
    var standalone=mission.role==="standalone-task",total=standalone?Math.max(1,tasks.length):3;
    var done=tasks.filter(function(task){return task.status==="done"||task.status==="resolved";}).length;
    var state=tasks.some(function(task){return task.status==="in_progress";})?TASK_RANK.in_progress:
      (tasks.length&&done===tasks.length?TASK_RANK.done:TASK_RANK.pending);
    return {done:done,total:total,ratio:total?done/total:0,state:state};
  }
  function missionState(group){
    var mission=group.mission||{},status=mission.status;
    if(status==="cancelled")return STATUS_RANK.cancelled;
    if(status==="resolved")return STATUS_RANK.resolved;
    if(status==="in_progress"||(group.tasks||[]).some(function(task){return task.status==="in_progress";}))return STATUS_RANK.in_progress;
    return mission.assignee?STATUS_RANK.pending:STATUS_RANK.unassigned;
  }
  function agentName(mission,options){
    if(options.agentIdentity)return options.agentIdentity(mission.assignee,mission.loc);
    if(root.ykAgentIdentity&&root.ykAgentIdentity.display)return root.ykAgentIdentity.display(mission.assignee,mission.loc);
    return text(mission.assignee);
  }
  function valueFor(group,key,options){
    options=options||{};var mission=group.mission||{},progress;
    switch(key){
      case "agent": return [agentName(mission,options),text(mission.loc),text(mission.id)];
      case "project": return [text(mission.project_name||mission.project),text(mission.project),text(mission.id)];
      case "mission": return [text(mission.display_ref||mission.id),ms(mission.created_at),text(mission.subject),text(mission.id)];
      case "tasks": progress=taskProgress(group);return [progress.ratio,progress.done,progress.total,progress.state,text(mission.id)];
      case "state": return [missionState(group),latest(group),text(mission.id)];
      default:return [0,text(mission.id)];
    }
  }
  function sort(groups,key,direction,options){
    if(KEYS.indexOf(key)<0)key="mission";
    var sign=direction==="asc"?1:-1;
    return (groups||[]).map(function(group,index){return {group:group,index:index,value:valueFor(group,key,options)};})
      .sort(function(a,b){return sign*compareTuple(a.value,b.value)||(a.index-b.index);})
      .map(function(item){return item.group;});
  }
  function next(current,key){
    var active=current&&KEYS.indexOf(current.key)>=0?current:{key:"mission",dir:"desc"};
    return active.key===key?{key:key,dir:active.dir==="asc"?"desc":"asc"}:{key:key,dir:"asc"};
  }
  function normalize(value){
    return value&&KEYS.indexOf(value.key)>=0&&(value.dir==="asc"||value.dir==="desc")
      ?{key:value.key,dir:value.dir}:{key:"mission",dir:"desc"};
  }

  root.YkTareasSort={sort:sort,valueFor:valueFor,next:next,normalize:normalize,keys:KEYS.slice(),_test:{taskProgress:taskProgress,missionState:missionState,latest:latest,compareTuple:compareTuple}};
})(typeof window!=="undefined"?window:globalThis);
