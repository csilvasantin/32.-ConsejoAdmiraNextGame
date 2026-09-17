/* Récord diario histórico y distancia viva para batirlo.
 * El récord excluye el día en curso: si hoy lo supera, la meta no se mueve
 * detrás del líder en cada refresco. */
(function (root) {
  "use strict";

  function topRows(day) {
    return (day && Array.isArray(day.top) ? day.top : []).filter(function (row) {
      return row && String(row.agent || "").trim() && Number.isFinite(Number(row.points));
    }).map(function (row) {
      return { agent:String(row.agent).trim(), points:Math.max(0, Number(row.points) || 0) };
    }).sort(function (a, b) { return b.points - a.points || a.agent.localeCompare(b.agent, "es"); });
  }

  function dailyRecord(payload, todayKey) {
    var days = payload && Array.isArray(payload.all_days) ? payload.all_days : [];
    var today = String(todayKey || payload && payload.evolution && payload.evolution.end || "");
    var records = [];
    days.forEach(function (day) {
      if (!day || String(day.day || "") === today) return;
      topRows(day).forEach(function (row) {
        records.push({ day:String(day.day || ""), agent:row.agent, points:row.points });
      });
    });
    records.sort(function (a, b) {
      return b.points - a.points || a.day.localeCompare(b.day) || a.agent.localeCompare(b.agent, "es");
    });
    var record = records[0] || null;
    var todayRow = days.filter(function (day) { return day && String(day.day || "") === today; })[0] || null;
    var leader = topRows(todayRow)[0] || null;
    if (!record) return { available:false, today:today, record:null, leader:leader };
    var target = record.points + 1, current = leader ? leader.points : 0;
    return { available:true, today:today, record:record, leader:leader, target:target,
      remaining:Math.max(0, target - current), beatenBy:Math.max(0, current - record.points),
      progress:Math.max(0, Math.min(100, target ? current / target * 100 : 0)) };
  }

  function periodKey(day, period) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return "";
    if (period === "month") return day.slice(0, 7) + "-01";
    if (period !== "week") return day;
    var date = new Date(day + "T12:00:00Z"), weekday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - weekday);
    return date.toISOString().slice(0, 10);
  }

  // A record is the best CLOSED comparable period in the retained factual data.
  // Current rows come from the same scope and metric as the podium, never a
  // previous period's total or a rolling 60-minute trend.
  function periodRecord(payload, period, now, currentRows, identityKey) {
    period = ["hour", "day", "week", "month"].indexOf(period) >= 0 ? period : "day";
    var millis = Number(now == null ? Date.now() : now), today = zoneDateKey(millis, "Europe/Madrid");
    var keyOf = typeof identityKey === "function" ? identityKey : function (value) { return String(value || ""); };
    var current = topRows({top:currentRows || []}), allowed = new Set(current.map(function (row) { return keyOf(row.agent); }));
    var records = [], coverage = null, sourceAvailable = false;
    if (period === "hour") {
      var hourly = payload && payload.hour_records, boundary = Math.floor(millis / 3600000) * 3600000;
      sourceAvailable = !!(hourly && Array.isArray(hourly.records));
      coverage = hourly && hourly.coverage || null;
      (sourceAvailable ? hourly.records : []).forEach(function (row) {
        if (!row || !Number.isFinite(Number(row.start)) || !Number.isFinite(Number(row.end)) || Number(row.end) <= Number(row.start) || Number(row.end) > boundary || !allowed.has(keyOf(row.agent)) || !Number.isFinite(Number(row.points))) return;
        records.push({agent:String(row.agent),points:Math.max(0,Number(row.points)),start:Number(row.start),end:Number(row.end)});
      });
    } else {
      var days = payload && Array.isArray(payload.all_days) ? payload.all_days : null;
      sourceAvailable = !!days;
      var currentStart = periodKey(today,period), buckets = new Map();
      (days || []).forEach(function (day) {
        var start = periodKey(day && day.day,period);
        if (!start || start >= currentStart) return;
        topRows(day).forEach(function (row) {
          var agentKey = keyOf(row.agent); if (!allowed.has(agentKey)) return;
          var key = start + "|" + agentKey, entry = buckets.get(key);
          if (!entry) { entry={agent:row.agent,points:0,day:start}; buckets.set(key,entry); }
          entry.points += row.points;
        });
      });
      records = Array.from(buckets.values());
      coverage = {start_day:payload && payload.first_day || days && days.length && days[0].day || null,end_day:currentStart,source:"retained_facts"};
    }
    records.sort(function (a,b) { return b.points-a.points || String(a.day || a.start).localeCompare(String(b.day || b.start)) || a.agent.localeCompare(b.agent,"es"); });
    var record = records[0] || null, leader = current[0] || null;
    if (!record) return {available:false,sourceAvailable:sourceAvailable,period:period,record:null,leader:leader,coverage:coverage};
    var target=record.points+1, points=leader?leader.points:0;
    return {available:true,sourceAvailable:sourceAvailable,period:period,record:record,leader:leader,coverage:coverage,
      target:target,remaining:Math.max(0,target-points),beatenBy:Math.max(0,points-record.points),
      progress:Math.max(0,Math.min(100,points/target*100))};
  }

  function zoneClock(now, timeZone) {
    var parts = {}, date = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    new Intl.DateTimeFormat("en-GB", {
      timeZone:timeZone || "Europe/Madrid", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"
    }).formatToParts(date).forEach(function (part) { parts[part.type] = Number(part.value); });
    return { hour:parts.hour || 0, minute:parts.minute || 0, second:parts.second || 0 };
  }

  function zoneDateKey(now, timeZone) {
    var parts = {}, date = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    new Intl.DateTimeFormat("en-CA", {
      timeZone:timeZone || "Europe/Madrid", year:"numeric", month:"2-digit", day:"2-digit"
    }).formatToParts(date).forEach(function (part) { parts[part.type] = part.value; });
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  /* Ritmo del líder de hoy frente a una meta fija (récord histórico + 1).
   * Se calcula con el reloj civil de Madrid incluso si el navegador está en
   * otra zona. La proyección usa el promedio transcurrido del día y el ritmo
   * necesario reparte solamente los puntos que faltan entre las horas restantes. */
  function recordPace(chase, now, timeZone) {
    if (!chase || !chase.available) return { available:false };
    var clock = zoneClock(now, timeZone), elapsedHours = clock.hour + clock.minute / 60 + clock.second / 3600;
    var remainingHours = Math.max(0, 24 - elapsedHours), current = chase.leader ? Math.max(0, Number(chase.leader.points) || 0) : 0;
    var currentPerHour = elapsedHours > 0 ? current / elapsedHours : 0;
    var requiredPerHour = remainingHours > 0 ? chase.remaining / remainingHours : chase.remaining;
    var projected = elapsedHours > 0 ? currentPerHour * 24 : current;
    var won = chase.remaining === 0, ahead = won || projected >= chase.target;
    return {
      available:true, clock:clock, elapsedHours:elapsedHours, remainingHours:remainingHours,
      current:current, currentPerHour:currentPerHour, requiredPerHour:requiredPerHour,
      projected:projected, ahead:ahead, won:won, status:won ? "won" : (ahead ? "ahead" : "behind")
    };
  }

  var api = { periodKey:periodKey, periodRecord:periodRecord, topRows:topRows, dailyRecord:dailyRecord, zoneClock:zoneClock, zoneDateKey:zoneDateKey, recordPace:recordPace };
  root.YkHighscoreDailyRecord = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
