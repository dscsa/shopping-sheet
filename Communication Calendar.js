function orderShippedEvent(order, email, text) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Shipped: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Order Shipped', 'Order Failed', 'Needs Form'])

  var commArr = newCommArr(email, text)

  infoEmail('orderShippedEvent', eventTitle, commArr, cancel, order)

  newEvent(eventTitle, commArr)
}

function refillReminderEvent(order, email, text, hoursToWait, hourOfDay) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Refill Reminder: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Refill Reminder'])

  var commArr = newCommArr(email, text)

  infoEmail('refillReminderEvent', eventTitle, commArr, hoursToWait, hourOfDay, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait, hourOfDay)
}

function autopayReminderEvent(order, email, text, hoursToWait, hourOfDay) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Autopay Reminder: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Autopay Reminder'])

  var commArr = newCommArr(email, text)

  infoEmail('autopayReminderEvent', eventTitle, commArr, hoursToWait, hourOfDay, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait, hourOfDay)
}

function orderCreatedEvent(order, email, text, hoursToWait) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Created: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Order Created', 'Order Updated', 'Order Hold', 'No Rx', 'Needs Form'])

  var commArr = newCommArr(email, text)

  infoEmail('orderCreatedEvent', eventTitle, commArr, hoursToWait, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait)
}

function orderHoldEvent(order, email, text, hoursToWait) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Hold: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Order Created', 'Order Updated', 'Order Hold', 'No Rx'])

  var commArr = newCommArr(email, text)

  infoEmail('orderHoldEvent', eventTitle, commArr, hoursToWait, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait)
}

function orderUpdatedEvent(order, email, text, hoursToWait) {
  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Updated: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Order Created', 'Order Updated', 'Order Hold', 'No Rx'])

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

  var cancel = cancelEvents(patientLabel, ['No Rx'])

  var commArr = newCommArr(email, text)

  infoEmail('noRxEvent', eventTitle, commArr, hoursToWait, hourOfDay, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait, hourOfDay)
}

function orderFailedEvent(order, email, text, hoursToWait, hourOfDay) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' Order Failed: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['Order Failed'])

  var commArr = newCommArr(email, text)

  infoEmail('orderFailedEvent', eventTitle, commArr, hoursToWait, hourOfDay, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait, hourOfDay)
}

function newPatientFollowupEvent(order, email, hoursToWait, hourOfDay) {

  var patientLabel = getPatientLabel(order)
  var eventTitle   = order.$OrderId+' New Patient Followup: '+patientLabel+'.  Created:'+new Date()

  var cancel = cancelEvents(patientLabel, ['New Patient Followup'])

  var commArr = newCommArr(email)

  infoEmail('newPatientFollowupEvent', eventTitle, commArr, hoursToWait, hourOfDay, cancel, order)

  newEvent(eventTitle, commArr, hoursToWait, hourOfDay)
}

function newCommArr(email, text) {

  if ( ! LIVE_MODE) {
    email.email = DEBUG_EMAIL
    text.sms    = DEBUG_PHONE
  } else {
    email.bcc = DEBUG_EMAIL
  }

  email.from = 'Good Pill Pharmacy < support@goodpill.org >' //spaces inside <> are so that google cal doesn't get rid of "HTML" if user edits description

  if ( ! text) return [email]
  
  //addCallFallback
  var json = JSON.stringify(text)

  text = formatText(json)
  call = formatCall(json)

  call.message = 'Hi, this is Good Pill Pharmacy <Pause />'+call.message+' <Pause length="2" />if you need to speak to someone please call us at 8,,,,8,,,,8 <Pause />9,,,,8,,,,7 <Pause />5,,,,1,,,,8,,,,7. <Pause length="2" /> Again our phone number is 8,,,,8,,,,8 <Pause />9,,,,8,,,,7 <Pause />5,,,,1,,,,8,,,,7. <Pause />'
  call.call    = call.sms+','+DEBUG_PHONE
  call.sms     = undefined

  text.fallbacks = [call]

  return [text, email]
}

function formatText(textJson) {

  textJson = textJson
    .replace(/<br>/g, '\\n')
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
    .replace(/(\w):(?!\/\/)/g, '$1<Pause length=\\"2\\" />') //Don't capture JSON text or URL links
    .replace(/;<br>/g, '<Pause /> and <Pause />') //combine drug list with "and" since it sounds more natural
    .replace(/;|\./g, ' <Pause />') //can't do commas without testing for inside quotes because that is part of json syntax
    .replace(/(<br>)+/g, ' <Pause length=\\"2\\" />')
    .replace(/\.(\d)(\d)?(\d)?/g, ' point $1,,$2,,$3') //skips pronouncing decimal points
    .replace(/(\d+)MG/g, '<Pause />$1 milligrams')
    .replace(/(\d+)MCG/g, '<Pause />$1 micrograms')
    .replace(/(\d+)MCG/g, '<Pause />$1 micrograms')
    .replace(/ Rxs/ig, ' prescriptions')
    .replace(/ ER /ig, ' extended release ')
    .replace(/ DR /ig, ' delayed release ')
    .replace(/ TAB| CAP/ig, ' <Pause />')
    .replace(/\#(\d)(\d)(\d)(\d)(\d)(\d)?/, 'number <Pause />$1,,$2,,$3,,$4,,$5,,$6<Pause /> again that is order number <Pause />$1,,$2,,$3,,$4,,$5,,$6')

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
    var title = events[i].getTitle()
    if ( ~ title.indexOf('CALLED') ||  ~ title.indexOf('EMAILED') ||  ~ title.indexOf('TEXTED')) continue
    events[i].setTitle(title+' Deleted:'+new Date())
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
