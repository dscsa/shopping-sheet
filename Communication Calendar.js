function orderShippedEvent(order, email, text) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Shipped: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Order Shipped', 'Order Failed'])

  infoEmail('orderShippedEvent', eventTitle, email, text, order, cancel)

  newEvent(eventTitle, newCommArr(email, text))
}

function refillReminderEvent(order, email, text, hoursToWait, hourOfDay) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Refill Reminder: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Refill Reminder'])

  infoEmail('refillReminderEvent', eventTitle, email, text, hoursToWait, hourOfDay, order, cancel)

  newEvent(eventTitle, newCommArr(email, text), hoursToWait, hourOfDay)
}

function autopayReminderEvent(order, email, text, hoursToWait, hourOfDay) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Autopay Reminder: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Autopay Reminder'])

  infoEmail('autopayReminderEvent', eventTitle, email, text, hoursToWait, hourOfDay, order, cancel)

  newEvent(eventTitle, newCommArr(email, text), hoursToWait, hourOfDay)
}

function orderUpdatedEvent(order, email, text, hoursToWait) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Updated: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Order Updated'])

  infoEmail('orderUpdatedEvent', eventTitle, email, text, hoursToWait, order, cancel)

  newEvent(eventTitle, newCommArr(email, text), hoursToWait)
}

function needsFormEvent(order, email, text, hoursToWait, hourOfDay) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Needs Form: '+patientLabel+'.  Created:'+new Date()

  infoEmail('needsFormEvent', eventTitle, email, text, hoursToWait, hourOfDay, order)

  newEvent(eventTitle, newCommArr(email, text), hoursToWait, hourOfDay)
}

function orderFailedEvent(order, email, text, hoursToWait, hourOfDay) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Failed: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Order Failed'])

  infoEmail('orderFailedEvent', eventTitle, email, text, hoursToWait, hourOfDay, order, cancel)

  newEvent(eventTitle, newCommArr(email, text), hoursToWait, hourOfDay)
}

function newCommArr(email, text) {

  if ( ! LIVE_MODE) {
    email.email = 'adam@sirum.org'
    text.sms    = '6507992817'
  }

  email.from = 'support@goodpill.org'
  email.subject = 'v6 '+email.subject //v6 Debugging

  //addCallFallback
  var json = JSON.stringify(text)

  text = formatText(json)
  call = formatCall(json)

  call.message = 'Hi, this is Good Pill Pharmacy....'+call.message
  call.call    = call.sms
  call.sms     = undefined
  //text.fallbacks = [call]

  return [text, email, call]
}

function formatText(textJson) {

  textJson = textJson
    .replace(/(<br>){2,}/g, '%0a%0a')
    .replace(/(<br>)+/g, ' ')

  try {
    return JSON.parse(textJson)
  } catch (e) {
    debugEmail('formatText json.parse error', textJson, e)
  }
}

function formatCall(callJson) {

  //Improve Pronounciation
  callJson = callJson
    .replace(/;|\./g, '<pause>') //can't do commas without testing for inside quotes because that is part of json syntax
    .replace(/(<br>)+|(%0a)+/g, '<pause>')
    .replace(/MG/g, 'milligrams')
    .replace(/MCG/g, 'micrograms')
    .replace(/Rxs/ig, 'prescriptions')
    .replace(/ ER /ig, 'extended release')
    .replace(/ DR /ig, 'delayed release')
    .replace(/ TAB| CAP/ig, '')
    .replace(/\#(\d)(\d)(\d)(\d)(\d)(\d)?/, 'number $1$2...$3$4...$5$6...')

  try {
    return JSON.parse(callJson)
  } catch (e) {
    debugEmail('formatCall json.parse error', callJson, e)
  }
}

//commArr as defined by the communication-calendar repository
//(optional) minsToWait is the number of minutes before the communications are made.  If left out communication is made the next minute
//this is helpful in two scenarios:
//1) you have a message that is not yet relevent (you are out of refills)
//2) you want to batch changes into set intervals so that you don't spam users (Order Update Emails)
//(optional) The 24-based hour of the day.  In case you want the communication to go out at a certain time of day
function newEvent(eventTitle, commArr, hoursToWait, hourOfDay) {

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
  var copy = date ? new Date(date.getTime ? date.getTime() : date) : new Date()
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

  var matches = events.filter(function(event) {
      var title = event.getTitle()
      return typeArr.reduce(function(match, type) {
          return match || ~ title.indexOf(type)
      }, null) //null is neccessary
  })

  if (events.length)
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

  var cancel = []
  var events = searchEvents(patientLabel, typeArr)

  for (var i in events) {
    events[i].deleteEvent()
    cancel.push(['deleted an event', eventString(events[i])])
  }

  return cancel
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
