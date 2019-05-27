//All Communication should group drugs into 4 Categories based on ACTION/NOACTION and FILL/NOFILL
//1) FILLING NO ACTION
//2) FILLING ACTION
//3) NOT FILLING ACTION
//4) NOT FILLING NO ACTION
function groupDrugs(order) {

  var group = {
    FILL_ACTION:[],
    FILL_NOACTION:[],
    NOFILL_ACTION:[],
    NOFILL_NOACTION:[],
    FILLED:[],
    NO_REFILLS:[],
    NO_AUTOFILL:[],
    MIN_DAYS:Infinity
  }

  for (var i in order.$Drugs) {
    var drug   = order.$Drugs[i]
    var name   = drug.$Name.replace(/[*^] /, '') //Get rid of the asterick we use for internal purposes that marks them as not in the order.

    var fill   = drug.$Days ? 'FILL_' : 'NOFILL_'
    var action = (drug.$Status || 'NOACTION').split('_')[0] //ACTION OR NOACTION

    group[fill+action].push(name+' '+drug.$Msg)

    if (drug.$Days) //This is handy because it is not appended with a message like the others
      group.FILLED.push(name)

    if ( ! drug.$Refills)
      group.NO_REFILLS.push(name+' '+drug.$Msg)

    if (drug.$Days && ! drug.$Autofill.rx)
      group.NO_AUTOFILL.push(name+' '+drug.$Msg)

    if (drug.$Days < group.MIN_DAYS)
      group.MIN_DAYS = drug.$Days
  }

  return group
}

//We are coording patient communication via sms, calls, emails, & faxes
//by building commication arrays based on github.com/dscsa/communication-calendar
function orderShippedNotice(order, invoice) {

  var groups   = groupDrugs(order)
  refillReminderNotice(order, groups)

  var numFills = groups.FILL_ACTION.length + groups.FILL_NOACTION.length
  var subject  = 'Your order '+(numFills ? ' of '+numFills+' items' : '')+'has shipped and should arrive in 3-5 days.'
  var message  = ''

  if (groups.FILLED.length)
    message += '<br><br>Your Order includes the following medications:<br>'+groups.FILLED.join(';<br>')+';'

  if (groups.FILL_ACTION.length+groups.NOFILL_ACTION.length)
    message += '<br><br>Please take action on the following medications:<br>'+groups.FILL_ACTION.concat(groups.NOFILL_ACTION).sort(sortByMsg).join(';<br>')+';'

  var email = { email:'adam@sirum.org' }
  var text  = { sms:'6507992817' }

  text.message =
    subject+
    ' View it at '+shortLink('https://docs.google.com/document/d/'+invoice.getId()+'/pub?embedded=true')+
    '. Track it at '+shortLink(trackingURL(order.$Tracking))+'. '+
    message.replace(/(<br>)+/g, ' ')

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    'Thanks for choosing Good Pill Pharmacy. '+subject,
    '',
    'Your receipt for order <strong>#'+order.$OrderId+'</strong> is attached. Your tracking number is '+trackingLink(order.$Tracking)+'.',
    'Use this link to request delivery notifications and/or provide the courier specific delivery instructions.',
    message,
    '',
    'Thanks!',
    'The Good Pill Team',
    '',
    ''
  ].join('<br>')
  email.attachments = [invoice.getId()]

  orderShippedEvent(order, email, text)
}

function refillReminderNotice(order, groups) {

  if ( ! groups.NO_REFILLS.length && ! groups.NO_AUTOFILL.length) return

  var subject  = 'We cannot refill these Rxs without your help.'
  var message      = ''

  if (groups.NO_REFILLS.length)
    message += '<br><br>Please contact to get a new Rx for the following medications:<br>'+groups.NO_REFILLS.join(';<br>')+';'

  if (groups.NO_AUTOFILL.length)
    message += '<br><br>The following medications will NOT be filled automatically and must be requested 2 weeks in advance:<br>'+groups.NO_AUTOFILL.join(';<br>')+';'

  var email = { email:'adam@sirum.org' }
  var text  = { sms:'6507992817' }

  text.message = subject+message.replace(/(<br>)+/g, ' ')

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    'We wanted to give you a friendly reminder: '+subject,
    message,
    '',
    'Thanks!',
    'The Good Pill Team',
    '',
    ''
  ].join('<br>')

  refillReminderEvent(order, email, text, groups.MIN_DAYS*24, 12)
}

//Called from Webform so that we didn't have to repeat conditional logic
function autopayReminderNotice(order) {

  var subject  = "Autopay Reminder."
  var message  = "Because you are enrolled in autopay, we will be be billing your card "+order.$Card+' $'+order.$Fee+".00 for last month's Order #"+order.$OrderId

  var email = { email:'adam@sirum.org' }
  var text  = { sms:'6507992817', message:subject+' '+message }

  text.message = subject+message.replace(/(<br>)+/g, ' ')

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    "Quick reminder that we are billing your card this week for last month's order.",
    message,
    '',
    'Thanks!',
    'The Good Pill Team',
    '',
    ''
  ].join('<br>')

  var nextMonth = new Date(scriptId.getFullYear(), scriptId.getMonth() + 1, 1)
  var timeWait  = nextMonth - new Date()

  autopayReminderEvent(order, email, text, timeWait/1000/60/60, 14)
}

//We are coording patient communication via sms, calls, emails, & faxes
//by building commication arrays based on github.com/dscsa/communication-calendar
function orderUpdatedNotice(order, drugsChanged) {

  if (drugsChanged) {
    drugsChanged = JSON.stringify(drugsChanged) //hacky way for us to search for partial matches with indexOf (see below)
    var majorChanges = drugsChanged.split(/REMOVED FROM ORDER|ADDED TO ORDER|ADDED TO PROFILE AND ORDER/)

    if (majorChanges.length <= 1) return   //Don't renotify on small changes like QTY, DAYS, REFILLS.  Only when adding or subtracting drugs
  }

  var groups     = groupDrugs(order)
  var numFills   = groups.FILL_ACTION.length + groups.FILL_NOACTION.length
  var numNoFills = groups.NOFILL_ACTION.length + groups.NOFILL_NOACTION.length

  ///It's depressing to get updates if nothing is being filled
  if ( ! numFills) return debugEmail('orderUpdateNotice NOT sent', 'drugsChanged', drugsChanged, 'numFills', numFills, order, groups)

  var subject = ! drugsChanged
    ? 'We are starting to prepare '+numFills+' items for Order #'+order.$OrderId+'.'
    : 'Update for Order #'+order.$OrderId+' of '+numFills+' items.'
  var message = '<br><br>Your order will have the following once we confirm their availability:<br>'+groups.FILLED.join(';<br>')+';'

  if (numNoFills)
    message += '<br><br>Below are prescription(s) that we have but are not going to fill right now:<br>'+groups.NOFILL_ACTION.concat(groups.NOFILL_NOACTION).sort(sortByMsg).join(';<br>')+';'

  var suffix = [
    "Note: if this is correct, there is no need to do anything. If you want to change or delay this order, please let us know as soon as possible. If delaying, please specify the date on which you want it filled, otherwise if you don't, we will delay it 3 weeks by default.",
    order.$Patient.medsync ? '* The goal of Med Sync is to syncronize your refill dates so that we can consolidate as many of your medications as possible into a single order, rather than sending your medications in separate orders. For this reason, this Rx may be filled for a fewer number of days in this Order before resuming to a normal number of days.' : ''
  ].join('<br><br>')


  var text  = { sms:'6507992817', message:subject+message.replace(/(<br>)+/g, ' ') }
  var email = { email:'adam@sirum.org' }

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    'Thanks for choosing Good Pill Pharmacy. '+subject+' We will notify you again once it ships.',
    '',
    message,
    '',
    (numFills >= numNoFills) ? 'Thanks!' : 'Apologies for any inconvenience,',
    'The Good Pill Team',
    '',
    '',
    suffix
  ].join('<br>')

  //Wait 15 minutes to hopefully batch staggered surescripts and manual rx entry and cindy updates
  orderUpdatedEvent(order, email, text, 15/60)
}


function needsFormNotice(order, email, text, hoursToWait, hourOfDay) {

  var groups   = groupDrugs(order)
  var numFills = groups.FILL_ACTION.length + groups.FILL_NOACTION.length

  ///It's depressing to get updates if nothing is being filled
  if (numFills) {
    var subject =  "Please take 5mins to register so that we can fill your Rxs."
    var message = "Welcome to Good Pill!  We are excited to fill your 1st order."
  }
  else {
    var subject =  "Welcome to Good Pill! We are so sorry but we can't fill the Rxs that we received from your doctor"
    var message = "Please register online or give us a call if you want to tranfer these Rxs to your local pharmacy.  Because we rely on donated medicine, we can only fill medications that are on our Formulary"
  }

  var email = { email:'adam@sirum.org' }
  var text  = { sms:'6507992817', message:subject+' '+message }

  text.message = subject+message.replace(/(<br>)+/g, ' ')

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    subject+' '+message,
    '',
    'Thanks!',
    'The Good Pill Team',
    '',
    ''
  ].join('<br>')

  //By basing on added at, we remove uncertainty of when script was run relative to the order being added
  var hourAdded = order.$RowAdded.getHours()

  if(hourAdded < 10){
    //A if before 10am, the first one is at 10am, the next one is 6pm, then 10am tomorrow, then 6pm tomorrow
    var hoursToWait = [0, 0, 24, 24]
    var hourOfDay   = [10, 18, 10, 18]

  } else if (hourAdded < 17){
    //A if before 5pm, the first one is 15mins from now, the next one is 6pm, then 9am tomorrow, then 6pm tomorrow
    var hoursToWait = [0, 0, 24, 24]
    var hourOfDay   = [null, 18, 10, 18]

  } else {
    //B if after 5pm, the first one is 9am tomorrow, 6pm tomorrow, 9am the day after tomorrow, 6pm day after tomorrow.
    var hoursToWait = [24, 24, 48, 48]
    var hourOfDay   = [10, 18, 10, 18]
  }

  needsFormEvent(order, email, text, hoursToWait[0], hourOfDay[0])

  if ( ! numFills) return //Don't hassle folks if we aren't filling anything

  needsFormEvent(order, email, text, hoursToWait[1], hourOfDay[1])
  needsFormEvent(order, email, text, hoursToWait[2], hourOfDay[2])
  needsFormEvent(order, email, text, hoursToWait[3], hourOfDay[3])
}

function orderFailedNotice(order) {

  var subject  = "We are having trouble with your Order."
  var message  = order.$Patient.source == 'Transfer'
    ? "We were unable to transfer the Rxs you requested from "+order.$Pharmacy.short+". This usually happens because we have the wrong pharmacy on file, we are requesting the wrong Rxs, or your Rxs have no refills remaining"
    : "We haven't gotten any Rxs from your doctor yet. You may want to contact your doctor.  If you had meant to create a transfer from your pharmacy instead, please login to your account and place a new 'transfer' order or give us a call."

  var email = { email:'adam@sirum.org' }
  var text  = { sms:'6507992817', message:subject+' '+message }

  text.message = subject+message.replace(/(<br>)+/g, ' ')

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    subject+' '+message,
    '',
    'Thanks!',
    'The Good Pill Team',
    '',
    ''
  ].join('<br>')

  orderFailedEvent(order, email, text, 5*24, 16)
}

function sortByMsg(drug1, drug2) {

  var msg1 = drug1.match(/[a-z].*/)
  var msg2 = drug2.match(/[a-z].*/)

  if(msg1 < msg2) { return -1 }
  if(msg1 > msg2) { return  1 }
  return 0
}

function trackingURL(trackingNumber) {

  var url = '#'

  if (trackingNumber.length == 22) {
    url = 'https://tools.usps.com/go/TrackConfirmAction?tLabels='
  } else if (trackingNumber.length == 15 || trackingNumber.length == 12) { //Ground or Express
    url = 'https://www.fedex.com/apps/fedextrack/?tracknumbers='
  }

  return url+trackingNumber
}

//Convert gsheet hyperlink formula to an html link
function trackingLink(trackingFormula) {
  return trackingFormula.replace('=HYPERLINK(', '<a href=').replace(', "', '>').replace('")', '</a>')
}

function trackingFormula(tracking) {
  return '=HYPERLINK("'+trackingURL(tracking)+'", "'+tracking+'")'
}
