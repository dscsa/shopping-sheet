function orderShippedEvent(order, email, text) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Shipped: '+patientLabel+'.  Created On:'+new Date()

  cancelEvents(patientLabel, ['Order Shipped', 'Order Failed'])

  addCallFallback(text)

  debugEmail('orderShippedEvent', email, text, order)

  newEvent(eventTitle, [email, text])
}

function refillReminderEvent(order, email, text, hoursToWait, hourOfDay) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Refill Reminder: '+patientLabel+'.  Created On:'+new Date()

  cancelEvents(patientLabel, ['Refill Reminder'])

  addCallFallback(text)

  debugEmail('refillReminderEvent', email, text, hoursToWait, hourOfDay, order)

  newEvent(eventTitle, [email, text], hoursToWait, hourOfDay)
}

function autopayReminderEvent(order, email, text, hoursToWait, hourOfDay) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Autopay Reminder: '+patientLabel+'.  Created On:'+new Date()

  cancelEvents(patientLabel, ['Autopay Reminder'])

  addCallFallback(text)

  debugEmail('autopayReminderEvent', email, text, hoursToWait, hourOfDay, order)

  newEvent(eventTitle, [email, text], hoursToWait, hourOfDay)
}

function orderUpdatedEvent(order, email, text, hoursToWait) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Updated: '+patientLabel+'.  Created On:'+new Date()

  cancelEvents(patientLabel, ['Order Updated'])

  addCallFallback(text)

  debugEmail('orderUpdatedEvent', email, text, hoursToWait, order)

  newEvent(eventTitle, [email, text], hoursToWait)
}

function needsFormEvent(order, email, text, hoursToWait, hourOfDay) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Needs Form: '+patientLabel+'.  Created On:'+new Date()

  addCallFallback(text)

  debugEmail('needsFormEvent', email, text, hoursToWait, hourOfDay, order)

  newEvent(eventTitle, [email, text], hoursToWait, hourOfDay)
}

function orderFailedEvent(order, email, text, hoursToWait, hourOfDay) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Failed: '+patientLabel+'.  Created On:'+new Date()

  cancelEvents(patientLabel, ['Order Failed'])

  addCallFallback(text)

  debugEmail('orderFailedEvent', email, text, hoursToWait, hourOfDay, order)

  newEvent(eventTitle, [email, text], hoursToWait, hourOfDay)
}

function addCallFallback(text) {
  var call = JSON.parse(JSON.stringify(text))
  call.call = call.sms
  call.sms  = undefined
  text.fallbacks = [call]
}

//commArr as defined by the communication-calendar repository
//(optional) minsToWait is the number of minutes before the communications are made.  If left out communication is made the next minute
//this is helpful in two scenarios:
//1) you have a message that is not yet relevent (you are out of refills)
//2) you want to batch changes into set intervals so that you don't spam users (Order Update Emails)
//(optional) The 24-based hour of the day.  In case you want the communication to go out at a certain time of day
function newEvent(eventTitle, commArr, hoursToWait, hourOfDay) {

  if ( ! LIVE_MODE) return

  var eventStart = addHours(hoursToWait || 0)

  if (hourOfDay)
    eventStart   = setHours(hourOfDay, eventStart)

  var eventStop  = addHours(30/60, eventStart) //Arbitrary length of 30mins so we can see it on calendar

  var description = JSON.stringify(commArr, null, ' ').replace(/ undefined/g, '') //just in case we were sloppy with undefined

  var calendar = CalendarApp.getCalendarById(GOOGLE_CAL_ID)

  calendar.createEvent(eventTitle, eventStart, eventStop, {description:description})
}

function getPatientLabel(order) {
  return order.$Patient.first+' '+order.$Patient.last+' '+order.$Patient.birth_date
}

function addHours(hours, date) {
  var copy = date ? new Date(date.getTime()) : new Date()
  copy.setTime(copy.getTime() + hours*60*60*1000)
  return copy
}

//Return a copy of the date (or now) with the 24-hour set
function setHours(hourOfDay, date) {
  var copy = date ? new Date(date.getTime()) : new Date()
  copy.setHours(Math.floor(hourOfDay), Math.floor((hourOfDay % 1)*60))
  return copy
}

function searchEvents(patientLabel, typeArr) {

  var start    = new Date()
  var stop     = addHours(24*90, start) //stop date seems to be required by Google.  Everything should happen within 90 days
  var calendar = CalendarApp.getCalendarById(GOOGLE_CAL_ID)
  var events   = calendar.getEvents(start, stop, { search:patientLabel })

  var matches  = []

  var matches = events.filter(function(event) {
      var title = event.getTitle()
      return typeArr.reduce(function(match, type) {
          return match || ~ title.indexOf(type)
      })
  })

  infoEmail('searchEvents', start, stop, patientLabel, typeArr, matches.length+' of '+events.length,'events:', eventString(events))

  return matches
}

//NOTE: RELIES on the assumption that ALL drugs (and their associated messages) end with a semicolon (;) and
//that NO other semicolons are used for any other reason. It removes everything between the drug name and the
//semicolon, and if no semicolons are left in the communication, then the entire communication is deleted
function removeDrugsFromEvents(patientLabel, drugs, typeArr) {

  if ( ! LIVE_MODE) return

  var log    = []
  var events = searchEvents(patientLabel, typeArr)

  for (var i in events) {
    var oldEvent = events[i].getDescription() //This is still JSON.stringified
    var regex    = new RegExp('('+drugs.join('|')+')[^;]*;', 'g')
    var newEvent = oldEvent.replace(regex, '')

    if (oldEvent == newEvent) continue

    if ( ~ newEvent.indexOf(';')) {
      log.push(['modified an event', eventString(events[i]), newEvent])
      events[i].setDescription(newEvent)
    }
    else {
      log.push(['deleted an event', eventString(events[i])])
      events[i].deleteEvent()
    }
  }

  debugEmail('removeDrugsFromEvents', patientLabel, drugs, typeArr, log)
}

function cancelEvents(patientLabel, typeArr) {

  if ( ! LIVE_MODE) return

  var log   = []
  var events = searchEvents(patientLabel, typeArr)

  for (var i in events) {
    events[i].deleteEvent()
    log.push(['deleted an event', eventString(events[i])])
  }

  debugEmail('cancelEvents', patientLabel, typeArr, log)
}

function eventString(events) {

  return events.reduce ? events.reduce(reduce,'') : reduce('', events)

  function reduce(s, event) {
    return s+event.getStartTime()+': '+event.getTitle()+', '+event.getDescription()+'; '
  }
}

function logAllCalendars() {
  var cals = CalendarApp.getAllCalendars()

  for (var i in cals)
    Logger.log(cals[i].getName()+' '+cals[i].getId())
}
