function getCallTime(order, hoursToAdd, dayOnly) {

  var needsCall = ! order.$Pharmacy || ! order.$New || ! order.$Drugs.length // New orders without webform ( ! $Pharmacy), and refills reminders ( ! $New) and, Missing eRXs, all need a call.

  //Basing on $RowAdded because $OrderAdded could have happened with no Rxs so it won't be added to the sheet.  We don't want to send refill reminder until we are pretty sure this order is going out (e.g., has drugs)
  //Deleting an order and then readding could cause an issue if the $RowAdded date changes.  However this will usually happen same day and refill reminder groups calls by day so this hopefully won't send out duplicate calls
  return needsCall ? addTime(hoursToAdd, order.$RowAdded, dayOnly) : null
}

function scheduleCalls(order, type, firstName, lastName, keepFutureCalls) {

  if ( ! keepFutureCalls)
    cancelFutureCalls(order, type) //just in case we are re-adding an order after a user deleted it

  var calls = ['$FirstCall', '$SecondCall', '$ThirdCall', '$FourthCall']
  for (var i in calls) {
    newCallEvent(order, order[calls[i]], type, firstName, lastName)
    delete order[calls[i]]
  }
}

//Reminder call only allows two variables to be interpolated firstname and lastname
//By default we use patient's first and last name but they can be overridden
//we use "type" to specify which Reminder Call "user" should be triggered
function newCallEvent(order, callTime, type, firstName, lastName) {

  if ( ! LIVE_MODE) return

  var patient  = order.$Patient
  var phone    = patient.phone1+(patient.phone2 ? ' '+patient.phone2 : '')

  if ( ! phone || ! callTime || ! patient) return

  if (callTime < new Date()) // Don't back fill calendar as this won't actually change remindercall and want calendar to accurately reflect what call did go out
    return infoEmail('getCallTime is null', 'rowAdded', order.$RowAdded, 'orderAdded', order.$OrderAdded, 'callTime', callTime, 'type', type, 'callTime', callTime, 'phone', phone, 'new Date()', new Date(), 'order', order)

  var endTime = addTime(0.5, callTime) //creates a calendar even that is 30 minutes long, just so it's easily visible on the calendar UI

  var eventTitle = phone+' '+(firstName || patient.first.split(' ')[0])+' '+(lastName || patient.last.split(' ')[0]) //in case of first: Adam S, or last: Kircher JR, we need to split so reminder call doesnt get confused.  Not tested if necessary - its possible reminder call is smart enough to make this work
  var location   = {location:type+" #"+order.$OrderId+", "+patient.first+" "+patient.last+".  Created On:"+new Date()}
  var calendar   = CalendarApp.getCalendarById('support@goodpill.org')

  //try to always send a text. if it's a landline then remindercall will fail on this, and will then try a voicecall instead
  var textEvent = calendar.createEvent(eventTitle+ " SMS", callTime, endTime, location)
  //var callEvent = calendar.createEvent(eventTitle+" CALL", callTime, endTime, location)
}

function addTime(hoursToAdd, date, dayOnly) {

  date = date ? new Date(date.getTime()) : new Date() //make a copy of date or default to current timestamp

  dayOnly && date.setHours(0,0,0,0)

  date.setTime(date.getTime() + hoursToAdd*60*60*1000)

  return date
}

function testCalendarSearch() {

   var start  = new Date("2019-05-20")
   var stop   = new Date("2019-08-18")
   var opts   = { search:"David Jones" }
   var calendars = CalendarApp.getCalendarById('support@goodpill.org')//CalendarApp.getAllCalendars() //getCalendarsByName('Good Pill Support')

   calendars = Array.isArray(calendars) ? calendars : [calendars]

   for (var i in calendars) {
     var calendar = calendars[i]
     Logger.log(calendar.getName()+' '+calendar.getId())
     var events = calendar.getEvents(start, stop, opts)
     for (var j in events) {
        Logger.log(events[j].getTitle()+' '+events[j].getLocation())
     }
   }
}

//TODO  Transfer failed should be drug specific (this is hard)
function cancelFutureCalls(order, type) {

  if ( ! LIVE_MODE) return

  var start  = addTime(15/60, null) //actually 15 minutes in the future (just in case we already added some calls 5 minutes out, lets give a little 15min buffer)
  var stop   = addTime(24*90, start) //stop date seems to be required by Google.  Everything should happen within 90 days
  var opts   = { search:order.$Patient.first + ' ' + order.$Patient.last }
  var events = CalendarApp.getCalendarById('support@goodpill.org').getEvents(start, stop, opts)
  var email  = []

  for (var j in events) {
    var location = events[j].getLocation()
    var title = events[j].getTitle()

    if ( ~ location.indexOf(type)) {
      events[j].deleteEvent()
      email.push('Deleting DUPLICATE EVENT '+type+' '+title+' '+location)
    }

    else if ( ~ location.indexOf('New Patient')) {
      events[j].deleteEvent()
      email.push('Deleting New Patient: '+title+' '+location)
    }

    else if ( ~ location.indexOf('Missing eRX') && order.$Drugs.length) { //Empty orders should not get rid of this alert
      events[j].deleteEvent()
      email.push('Deleting Missing eRx: '+title+' '+location)
    }

    else if ( ~ location.indexOf('Transfer Failed')) {
      events[j].deleteEvent()
      email.push('Deleting Transfer Failed: '+title+' '+location)
    }

    else if ( ~ location.indexOf('Order Updated')) {
      events[j].deleteEvent()
      email.push('Deleting Order Updated: '+title+' '+location)
    }

    else if ( ~ location.indexOf('Order Updated')) {
      events[j].deleteEvent()
      email.push('Deleting Order Updated: '+title+' '+location)
    }

    else if ( ~ location.indexOf('0 Refills')) {
      var newTitle = title
      for (var i in order.$Drugs) {
        var drug = order.$Drugs[i]
        if ( ! drug.$InOrder) continue
        var toReplace = removeDelimiters(drug.$Name)
        newTitle = newTitle.replace(toReplace+'; ', '').replace(toReplace, '') //to get the last one (of the list or by itself) we need to do without the ";<non breaking space>"
      }

      //Remove applicable drugs and delete the whole event if no drugs are left
      if (newTitle != title) {
        newTitle.match(/[A-Z]{2}.*SMS/) //Hacky but this works because drug names are capitalized and nothing else except "SMS" is.  This will break if something else capitalized is put into the title (e.g., patient last name).  Detecting semicolon wouldn't work because lots of events have only one drug and therefore no delimiter.
          ? events[j].setTitle(newTitle)
          : events[j].deleteEvent()

        email.push((newTitle.match(/[A-Z]{2}.*SMS/) ? 'Modifying' : 'Deleting')+' 0 Refills oldTitle:'+title+' newTitle:'+newTitle+' Location:'+location)
      }
    }

    else {
      email.push('NOT Deleting: '+title+' '+location)
    }
  }

  //if (events.length)
  infoEmail('cancelFutureCalls', start, stop, opts, 'type '+type, 'email:', email, events.length+' events:', events.reduce(eventDetails, ''), order, new Error().stack)
}

function setNewRowCalls(order) {

  //Use shopping sheet status to make sure we do not make calls when re-adding a row (does not catch one-item out of stock orders since no sheet is made in that case) so we check $Status as well
  if ( ~ order.$Status.indexOf('Re:') || order.$Status == 'Dispensed' || order.$Status == 'Shipped') //Hyperlink() doesn't start with "Re:"
    return infoEmail('Row likely readded because order is not yet in sheet but is already Shipped, Dispensed, or Shopped', order)

  if ( ! order.$Pharmacy) { //Use Pharmacy name rather than $New to keep us from repinging folks if the row has been readded
    setCallTimes(order)
    scheduleCalls(order, 'New Patient')
  }
  else if ( ! order.$Drugs.length) { //Patient filled out webform before RXs were sent
    missingRx(order)
  }
  else {
    rxReceivedNotification(order)
    debugEmail('rxReceivedNotification called because setNewRowCalls', '#'+order.$OrderId, order.$Status, order)
  }
}

function setCallTimes(order){

  //By basing on added at, we remove uncertainty of when script was run relative to the order being added
  var hourAdded = order.$RowAdded.getHours()

  //A if before 10am, the first one is at 10am, the next one is 6pm, then 10am tomorrow, then 6pm tomorrow
  if(hourAdded < 10){

    order.$FirstCall = getCallTime(order, 10, true)

    var secondCall = 18
    var thirdCall  = 24+10
    var fourthCall = 24+18
  //A if before 5pm, the first one is 15mins from now, the next one is 6pm, then 9am tomorrow, then 6pm tomorrow
  } else if(hourAdded < 17){

    order.$FirstCall = getCallTime(order, 10/60)

    var secondCall = 18
    var thirdCall  = 24+10
    var fourthCall = 24+18
  //B if after 5pm, the first one is 9am tomorrow, 6pm tomorrow, 9am the day after tomorrow, 6pm day after tomorrow.
  } else {

    order.$FirstCall = getCallTime(order, 24+10, true)

    var secondCall = 24+18
    var thirdCall  = 24+24+10
    var fourthCall = 24+24+18
  }

  if ( ! order.$Pharmacy) { //Refills only have a first call

    if ( ! order.$New)
      return sendEmail('hello@goodpill.org', 'Refill Patient does not have Backup Pharmacy', ['Refill Patient does not have Backup Pharmacy', JSON.stringify(order, null, '')])

    order.$SecondCall = getCallTime(order, secondCall, true)
    order.$ThirdCall = getCallTime(order, thirdCall, true)
    order.$FourthCall = getCallTime(order, fourthCall, true)
  }
}

//Replace <space> with <non-breaking space> the latter which reminder call does not consider a delimiter.  Also remove commas (that might appear in the drug strength)
function removeDelimiters(txt) {
  return txt.replace(/undefined| CAPSULE| TABLET| SOLUTION| CAP\b| TAB\b| HCL\b/g, '').replace(/,/g, '').replace(/ MG/g, 'MG').replace(/ /g, ' ')
}

function eventDetails(s, event) { return s+event.getStartTime()+': '+event.getTitle()+', '+event.getLocation()+'; ' }
