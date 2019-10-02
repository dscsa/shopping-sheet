function orderDispensedEvent(order, email, hoursToWait) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Dispensed: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(order.$Patient, ['Order Dispensed', 'Order Failed', 'Needs Form'])

  var commArr = newCommArr(email)

  infoEmail('orderDispensedEvent', eventTitle, commArr, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait)
}

function orderShippedEvent(order, email, text) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Shipped: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(order.$Patient, ['Order Shipped', 'Order Dispensed', 'Order Failed', 'Needs Form'])

  var commArr = newCommArr(email, text)

  infoEmail('orderShippedEvent', eventTitle, commArr, cancel, order)

  newEvent(eventTitle, commArr)
}

function refillReminderEvent(order, email, text, hoursToWait, hourOfDay) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Refill Reminder: '+patientLabel+'.  Created:'+new Date()

  //var cancel = cancelEvents(order.$Patient, ['Refill Reminder'])

  var commArr = newCommArr(email, text)

  infoEmail('refillReminderEvent', eventTitle, commArr, hoursToWait, hourOfDay, order) //cancel

  newEvent(eventTitle, commArr, hoursToWait, hourOfDay)
}

function autopayReminderEvent(order, email, text, hoursToWait, hourOfDay) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Autopay Reminder: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(order.$Patient, ['Autopay Reminder'])

  var commArr = newCommArr(email, text)

  infoEmail('autopayReminderEvent', eventTitle, commArr, hoursToWait, hourOfDay, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait, hourOfDay)
}

function orderCreatedEvent(order, email, text, hoursToWait) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Created: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(order.$Patient, ['Order Created', 'Transfer Requested', 'Order Updated', 'Order Failed', 'Order Hold', 'No Rx', 'Needs Form'])

  var commArr = newCommArr(email, text)

  infoEmail('orderCreatedEvent', eventTitle, commArr, hoursToWait, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait)
}

function transferRequestedEvent(order, email, text, hoursToWait) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Transfer Requested: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(order.$Patient, ['Order Created', 'Transfer Requested', 'Order Updated', 'Order Hold', 'No Rx'])

  var commArr = newCommArr(email, text)

  infoEmail('transferRequestedEvent', eventTitle, commArr, hoursToWait, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait)
}

function orderHoldEvent(order, email, text, hoursToWait) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Hold: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(order.$Patient, ['Order Created', 'Transfer Requested', 'Order Updated', 'Order Hold', 'No Rx'])

  var commArr = newCommArr(email, text)

  infoEmail('orderHoldEvent', eventTitle, commArr, hoursToWait, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait)
}

function orderUpdatedEvent(order, email, text, hoursToWait) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Updated: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(order.$Patient, ['Order Created', 'Transfer Requested', 'Order Updated', 'Order Hold', 'No Rx', 'Needs Form', 'Order Failed'])

  var commArr = newCommArr(email, text)

  infoEmail('orderUpdatedEvent', eventTitle, commArr, hoursToWait, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait)
}

function needsFormEvent(order, email, text, hoursToWait, hourOfDay) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Needs Form: '+patientLabel+'.  Created:'+new Date()

  var commArr = newCommArr(email, text)

  infoEmail('needsFormEvent', eventTitle, commArr, hoursToWait, hourOfDay, order)

  newEvent(eventTitle, commArr, hoursToWait, hourOfDay)
}

function noRxEvent(order, email, text, hoursToWait, hourOfDay) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' No Rx: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(order.$Patient, ['No Rx'])

  var commArr = newCommArr(email, text)

  infoEmail('noRxEvent', eventTitle, commArr, hoursToWait, hourOfDay, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait, hourOfDay)
}

function orderFailedEvent(order, email, text, hoursToWait, hourOfDay) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Failed: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(order.$Patient, ['Order Failed'])

  var commArr = newCommArr(email, text)

  infoEmail('orderFailedEvent', eventTitle, commArr, hoursToWait, hourOfDay, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait, hourOfDay)
}

function confirmShipmentEvent(order, email, hoursToWait, hourOfDay) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Confirm Shipment: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(order.$Patient)

  var commArr = newCommArr(email)

  infoEmail('confirmShipmentEvent', eventTitle, commArr, hoursToWait, hourOfDay, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait, hourOfDay)
}

function newCommArr(email, text) {

  var commArr = []

  if (LIVE_MODE && email.email && ! email.email.match(/\d\d\d\d-\d\d-\d\d@goodpill\.org/)) {
    email.bcc  = DEBUG_EMAIL
    email.from = 'Good Pill Pharmacy < support@goodpill.org >' //spaces inside <> are so that google cal doesn't get rid of "HTML" if user edits description
    commArr.push(email)
  }

  if (LIVE_MODE && text && text.sms && ! ~ DO_NOT_SMS.indexOf(text.sms)) {
    //addCallFallback
    var json = JSON.stringify(text)

    text = formatText(json)
    call = formatCall(json)

    call.message = 'Hi, this is Good Pill Pharmacy <Pause />'+call.message+' <Pause length="2" />if you need to speak to someone please call us at 8,,,,8,,,,8 <Pause />9,,,,8,,,,7 <Pause />5,,,,1,,,,8,,,,7. <Pause length="2" /> Again our phone number is 8,,,,8,,,,8 <Pause />9,,,,8,,,,7 <Pause />5,,,,1,,,,8,,,,7. <Pause />'
    call.call    = call.sms
    call.sms     = undefined

    text.fallbacks = [call]
    commArr.push(text)
  }

  return commArr
}

function formatText(textJson) {

  textJson = textJson
    .replace(/<br>/g, '\\n')
    .replace(/<.*?>/g, '') //Remove html tags such as email underlines
    .replace(/#(\d{4,})/g, '$1') //# sign makes text message think its a phone number and make an erroneous link with it

  try {
    return JSON.parse(textJson)
  } catch (e) {
    debugEmail('formatText json.parse error', textJson, e)
  }
}

function formatCall(callJson) {

  //Improve Pronounciation
  callJson = callJson
    .replace(/View it at [^ ]+ /, "")
    .replace(/Track it at [^ ]+ /, "View and track your order online at www.goodpill.org")
    .replace(/\(?888[)-.]? ?987[.-]?5187/g, '8,,,,8,,,,8 <Pause />9,,,,8,,,,7 <Pause />5,,,,1,,,,8,,,,7')
    .replace(/(www\.)?goodpill\.org/g, 'w,,w,,w,,dot,,,,good,,,,pill,,,,dot,,,,org,,,,again that is g,,,,o,,,,o,,,d,,,,p,,,,i,,,,l,,,,l,,,,dot,,,,o,,,,r,,,,g')
    .replace(/(\w):(?!\/\/)/g, '$1<Pause />') //Don't capture JSON text or URL links
    .replace(/;<br>/g, '<Pause /> and <Pause />') //combine drug list with "and" since it sounds more natural
    .replace(/;|\./g, ' <Pause />') //can't do commas without testing for inside quotes because that is part of json syntax
    .replace(/(<br>)+/g, ' <Pause length=\\"1\\" />')
    .replace(/\.(\d)(\d)?(\d)?/g, ' point $1,,$2,,$3') //skips pronouncing decimal points
    .replace(/ but /g, ',,,,but,,,,')
    .replace(/(\d+)MG/g, '<Pause />$1 milligrams')
    .replace(/(\d+)MCG/g, '<Pause />$1 micrograms')
    .replace(/(\d+)MCG/g, '<Pause />$1 micrograms')
    .replace(/ Rxs/ig, ' prescriptions')
    .replace(/ ER /ig, ' extended release ')
    .replace(/ DR /ig, ' delayed release ')
    .replace(/ TAB| CAP/ig, ' <Pause />')
    .replace(/\#(\d)(\d)(\d)(\d)(\d)(\d)?/, 'number,,,,$1,,$2,,$3,,$4,,$5,,$6') //<Pause /> again that is order number <Pause />$1,,$2,,$3,,$4,,$5,,$6

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

  //debugEmail('newEvent', 'eventTitle', eventTitle, 'hoursToWait', hoursToWait, 'hourOfDay', hourOfDay, 'eventStart', eventStart.toString())

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

function searchEvents(patient, typeArr) {

  typeArr = typeArr || []

  if ( ! patient.first) {
    debugEmail('searchEvents no patient first name', patient, typeArr)
    patient.first = ''
  }

  var start    = new Date()
  var stop     = addHours(24*90, start) //stop date seems to be required by Google.  Everything should happen within 90 days
  var calendar = CalendarApp.getCalendarById(GOOGLE_CAL_ID)
  var events   = calendar.getEvents(start, stop, { search:patient.birth_date }) //Can't put in name because can't google cal doesn't seem to support a partial word search e.g, "greg" will not show results for gregory

  var matches = events.filter(function(event) {
      var title = event.getTitle()
      return typeArr.reduce(function(match, type) {
          return match || matchPatient(title, patient, type)
      }, null) //null is neccessary
  })

  if (events.length)
    infoEmail('searchEvents', start, stop, patient, matches.length+' of '+events.length+' of the events below match the following:', typeArr,'events:', eventString(events))

  return matches
}

//TODO exactly replicate Guardian's patient matching function
function matchPatient(title, patient, type) {
  title = title.toLowerCase()
  return ~ title.indexOf(patient.first.toLowerCase().slice(0, 3)) && ~ title.indexOf(patient.last.toLowerCase()) && ~ title.indexOf(type.toLowerCase())
}

//NOTE: RELIES on the assumption that ALL drugs (and their associated messages) end with a semicolon (;) and
//that NO other semicolons are used for any other reason. It removes everything between the drug name and the
//semicolon, and if no semicolons are left in the communication, then the entire communication is deleted
function removeDrugsFromEvents(patient, drugs, typeArr) {

  if ( ! LIVE_MODE) return

  var log    = []
  var events = searchEvents(patient, typeArr)
  var regex  = new RegExp('('+drugs.join('|')+')[^;]*;', 'g')

  for (var i in events) {
    var oldEvent = events[i].getDescription() //This is still JSON.stringified

    var newEvent = oldEvent.replace(regex, '')

    if (oldEvent == newEvent) {
      log.push(['unmodified event', eventString(events[i]), newEvent])
    }
    else if ( ~ newEvent.indexOf(';')) {
      log.push(['modified an event', eventString(events[i]), newEvent])
      events[i].setDescription(newEvent)
    }
    else {
      log.push(['deleted an event', eventString(events[i])])
      events[i].deleteEvent()
    }
  }

  if (log.length)
    infoEmail('removeDrugsFromEvents', regex, patient, drugs, typeArr, log, events)
}

function cancelEvents(patient, typeArr) {

  if ( ! LIVE_MODE) return

  var cancel = []
  var events = searchEvents(patient, typeArr)

  for (var i in events) {

    var title = events[i].getTitle()

    if ( ~ title.indexOf('CALLED') ||  ~ title.indexOf('EMAILED') ||  ~ title.indexOf('TEXTED')) continue

    cancelEvent(events[i], title)

    cancel.push(['deleted an event', eventString(events[i])])
  }

  return cancel
}

function cancelEvent(event, title) {
  try { //We're sorry, a server error occurred. Please wait a bit and try again."
    event.setTitle(title+' Deleted:'+new Date())
    event.deleteEvent()
  } catch (e) {
    Utilities.sleep(5000)
    event.setTitle(title+' Deleted:'+new Date())
    event.deleteEvent()
  }
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
