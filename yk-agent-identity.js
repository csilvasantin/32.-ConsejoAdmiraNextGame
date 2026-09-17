/* yk-agent-identity.js — identidad visible = persona + equipo físico.
 *
 * El apellido visible es EXACTAMENTE el del diccionario de la norma 02, sin acortar
 * ni traducir: MacBookAirAzul → MBAAzul, luego NeoMBAAzul (no NeoAzul), y Mac Mini →
 * MacMini, luego NeoMacMini (no NeoMini). Carlos, 2026-08-04 · normativa regla 02.
 * (El 03-08 el apellido del Mini era `Mini`; Carlos lo corrigió el 04-08 a `MacMini`
 *  por la misma razón que `MBP16` no es `16`: el apellido no se abrevia. `NeoMini`
 *  se sigue LEYENDO como legado y se reescribe siempre como NeoMacMini.)
 *
 * Los nombres planos históricos se aceptan al leer. Toda UI visible debe llamar:
 *   ykAgentIdentity.display("Neo", "MacBook Pro 16")        → NeoMBP16
 *   ykAgentIdentity.display("Neo", "MacBookAirAzul")        → NeoMBAAzul
 *   ykAgentIdentity.display("Oraculo", "Mac Mini", "sub")   → SubOraculoMacMini
 *   ykAgentIdentity.display("Neo", "")                      → NeoSINMAQ
 * `scoped` conserva el nombre operativo sin SINMAQ para datos/rutas heredadas.
 */
(function (root) {
  "use strict";
  var MACHINES = [
    ["MacMini",["macmini","mac mini","mac mini carlos","admira-macmini","macmini.local"]],
    ["MBP14",["mbp14","macbookpro14","macbook pro 14","macbookpronegro14","macbookpro14negro","macbook pro negro 14","admira-macbookpro14","admira-macbookpronegro14"]],
    ["MBP16",["mbp16","macbookpro16","macbook pro 16","admira-macbookpro16","macbook-pro-16"]],
    ["MBA16",["mba16","macbookair16plata","macbookair16","macbook air 16 dg","mba 16 plata","admira-macbookair16"]],
    ["MBAAzul",["mbaazul","macbookairazul","macbook air azul","mba azul","admira-macbookairazul"]],
    ["MBARosa",["mbarosa","macbookairrosa","macbook air rosa","mba rosa","admira-macbookairrosa"]],
    ["MBACrema",["mbacrema","macbookaircrema","macbook air crema","mba crema","admira-macbookaircrema"]],
    ["MBAPlata",["mbaplata","macbookairplata","macbook air plata","mba plata","admira-macbookairplata"]],
    ["Zenbook",["asuszenbook","asus zenbook","admira-asuszenbook"]],
    ["DGX",["dgxspark","dgx spark","dgx-spark","spark-1e61","spark1e61"]],
    ["PGX",["thinkstationpgx","thinkstation pgx","thinkstation","lenovo-thinkstation","lenovothinkstation"]],
    ["GrokBot",["grokbot","grok bot","grok-bot","sand","xai","grok"]]
  ];
  var PERSONAS = [
    ["Oraculo",["oraculo","oráculo","oracle"]],
    ["Neo",["neo"]],["Morfeo",["morfeo","morpheus"]],["Trinity",["trinity"]],
    ["Smith",["smith","cypher","agente smith","smith gris","smith negro","smithgris","smithnegro"]],
    ["WhiteRabbit",["whiterabbit","white rabbit"]],
    ["Niobe",["niobe"]],
    ["Persefone",["persefone","perséfone","persephone"]],
    ["Seraph",["seraph","serafín","serafin"]],
    // Consejo de Silicio conectado por GrokBot. En la API ya son personas
    // canónicas; el navegador mantiene la misma tabla para no partir sus puntos
    // entre el alias plano y el apellido del equipo remoto.
    ["Wozniak",["wozniak","steve wozniak","stevewozniak","woz"]],
    ["Jobs",["jobs","steve jobs","stevejobs"]],
    ["Disney",["disney","walt disney","waltdisney"]],
    ["Lucas",["lucas","george lucas","georgelucas"]]
  ];
  var LEGACY_SUFFIXES = {
    "14":"MBP14", "16":"MBP16", "air16":"MBA16", "plata16":"MBA16",
    "azul":"MBAAzul", "rosa":"MBARosa", "crema":"MBACrema", "plata":"MBAPlata",
    "mini":"MacMini",
    "sinmaq":"SINMAQ"
  };
  /* Nombre canónico del EQUIPO. Distingue modelo y tamaño, no color: conviven
     MacBookPro14, MacBookPro16 y MacBookAir16, y ahí el «Negro» no desempata nada.
     Por eso el canónico del 14 es MacBookPro14 y no MacBookProNegro14 (Carlos,
     2026-08-08 · normativa regla 02). Las grafías viejas se siguen LEYENDO por el
     diccionario de arriba: MBP14 = MacBookPro14 = macbookpro14 = macbookpro14negro =
     MacBookProNegro14 es una sola máquina, y se normaliza antes de comparar — nunca
     se cotejan literales, o el equipo se parte en dos filas. */
  var CANONICAL_MACHINES = {
    MacMini:"Mac Mini", MBP14:"MacBookPro14", MBP16:"MacBook Pro 16",
    MBA16:"MacBookAir16plata", MBAAzul:"MacBook Air Azul", MBARosa:"MacBook Air Rosa",
    MBACrema:"MacBook Air Crema", MBAPlata:"MacBook Air Plata", Zenbook:"Asus Zenbook",
    DGX:"DGX Spark", PGX:"ThinkStation PGX", GrokBot:"GrokBot"
  };
  /* Apellido visible = el sufijo del diccionario, TAL CUAL. No hay tabla de apodos:
     NeoMBAAzul, NeoMacMini, SmithMBAAzul. Los apellidos cortos («Azul», «Mini») y
     «Agente Smith Azul» se siguen LEYENDO en parse() como legado, pero no se vuelven
     a escribir (normativa reglas 02 y 03). */
  function key(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function suffix(machine) {
    var k = key(machine);
    if(!k) return "";
    // macmini / MacMini explícito antes de coincidencias cortas
    if(k==="macmini" || k==="mini" || k.indexOf("macmini")===0) return "MacMini";
    for (var i=0;i<MACHINES.length;i++) {
      for (var j=0;j<MACHINES[i][1].length;j++) {
        var a=key(MACHINES[i][1][j]);
        if(k===key(MACHINES[i][0]) || k===a || k.indexOf(a)===0) return MACHINES[i][0];
      }
    }
    return "";
  }
  function parse(value) {
    var original=String(value||"").trim(), k=key(original), role="main";
    if(k.indexOf("infra")===0){role="infra";k=k.slice(5);}
    else if(k.indexOf("sub")===0){role="sub";k=k.slice(3);}
    k=k.replace(/^agente/,"");
    // SmithMacMini / NeoMacMini / OraculoMacMini (apellido completo)
    if(/macmini$/.test(k)){
      var baseMac=k.slice(0,-7);
      for(var pi=0;pi<PERSONAS.length;pi++){
        var pn=PERSONAS[pi][1].map(function(x){return key(x).replace(/^agente/,"");});
        if(pn.indexOf(baseMac)>=0 || key(PERSONAS[pi][0])===baseMac)
          return {role:role,persona:PERSONAS[pi][0],suffix:"MacMini",legacy:false};
      }
    }
    for(var i=0;i<PERSONAS.length;i++){
      var names=PERSONAS[i][1].map(function(x){return key(x).replace(/^agente/,"");})
        .sort(function(a,b){return b.length-a.length;});
      for(var j=0;j<names.length;j++) if(k.indexOf(names[j])===0){
        var tail=k.slice(names[j].length), sf=LEGACY_SUFFIXES[tail]||"";
        if(tail==="macmini"||tail==="mini") sf="MacMini";
        for(var m=0;m<MACHINES.length;m++) if(key(MACHINES[m][0])===tail){sf=MACHINES[m][0];break;}
        return {role:role,persona:PERSONAS[i][0],suffix:sf,legacy:!sf};
      }
    }
    var suffixes=MACHINES.map(function(m){return [key(m[0]),m[0]];});
    Object.keys(LEGACY_SUFFIXES).forEach(function(legacy){suffixes.push([key(legacy),LEGACY_SUFFIXES[legacy]]);});
    suffixes.sort(function(a,b){return b[0].length-a[0].length;});
    for(var s=0;s<suffixes.length;s++){
      var tail=suffixes[s][0], sf=suffixes[s][1];
      if(!tail||k.length<=tail.length||k.slice(-tail.length)!==tail)continue;
      var baseKey=k.slice(0,-tail.length);
      var raw=original.replace(/^(?:infra|sub)/i,"").replace(/^agente\s*/i,"").trim();
      for(var cut=raw.length;cut>0;cut--)if(key(raw.slice(0,cut))===baseKey){raw=raw.slice(0,cut).replace(/[\s._-]+$/,"");break;}
      return {role:role,persona:raw||baseKey,suffix:sf,legacy:false};
    }
    return {role:role,persona:original,suffix:"",legacy:true};
  }
  function nameWithSuffix(persona, sf){
    if(!sf || sf==="SINMAQ") return persona+(sf||"");
    return persona+sf;
  }
  function scoped(persona,machine,role){
    var p=parse(persona), r=role||p.role||"main", sf=suffix(machine)||p.suffix;
    var main=nameWithSuffix(p.persona, sf);
    return (r==="sub"?"Sub":r==="infra"?"Infra":"")+main;
  }
  function display(persona,machine,role){
    var p=parse(persona), r=role||p.role||"main", sf=suffix(machine)||p.suffix||"SINMAQ";
    var main=nameWithSuffix(p.persona, sf);
    return (r==="sub"?"Sub":r==="infra"?"Infra":"")+main;
  }
  /* Los informes usan el MISMO nombre que el resto de pantallas: una identidad, una
     forma de escribirla. Si el registro histórico no permite recomponerla, se devuelve
     tal cual en vez de inventar apellido. */
  function reportDisplay(owner,machine){
    var original=String(owner||"").trim(), p=parse(original), sf=suffix(machine)||p.suffix;
    if(!original||!sf)return original;
    var known=PERSONAS.some(function(row){return row[0]===p.persona;});
    if(!known)return original;
    return (p.role==="sub"?"Sub":p.role==="infra"?"Infra":"")+nameWithSuffix(p.persona,sf);
  }
  function base(value){return parse(value).persona;}
  /* Se pregunta primero al diccionario de EQUIPOS y solo después al de identidades:
     «macbookpro14negro» es un nombre de máquina, no lleva apellido al final, y por
     parse() salía vacío — una de las cinco grafías de la norma 02 sin normalizar. */
  function canonicalMachine(value){return CANONICAL_MACHINES[suffix(value)||parse(value).suffix]||"";}
  function missionPair(agent,machine,hints){
    var rawAgent=String(agent||"").trim(), rawMachine=String(machine||"").trim();
    if(!rawAgent)return {agent:"",machine:rawMachine};
    var resolved=suffix(rawMachine)?rawMachine:canonicalMachine(rawAgent);
    for(var i=0;!resolved&&i<(hints||[]).length;i++)resolved=canonicalMachine(hints[i]);
    if(!resolved)return {agent:"",machine:rawMachine};
    var p=parse(rawAgent);
    return {agent:scoped(p.persona,resolved,p.role),machine:resolved};
  }
  function same(a,b){return key(base(a))===key(base(b));}
  var api={key:key,suffix:suffix,parse:parse,scoped:scoped,display:display,reportDisplay:reportDisplay,base:base,same:same,
    canonicalMachine:canonicalMachine,missionPair:missionPair,
    spec:{unknownSuffix:"SINMAQ",machines:MACHINES.map(function(m){return {suffix:m[0],aliases:m[1].slice()};})}};
  root.ykAgentIdentity=api;
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
