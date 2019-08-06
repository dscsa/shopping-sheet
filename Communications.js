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
    var price  = (drug.$Days && ! order.$New) ? ', $'+drug.$Price+' for '+drug.$Days+' days' : ''
    var action = (drug.$Status || 'NOACTION').split('_')[0] //ACTION OR NOACTION

    group[fill+action].push(name+' '+drug.$Msg)

    if (drug.$Days) //This is handy because it is not appended with a message like the others
      group.FILLED.push(name+price)

    if ( ! drug.$Refills)
      group.NO_REFILLS.push(name+' '+drug.$Msg)

    if (drug.$Days && ! drug.$Autofill.rx)
      group.NO_AUTOFILL.push(name+' '+drug.$Msg)

    if (drug.$Days && ! drug.$Refills && drug.$Days < group.MIN_DAYS)
      group.MIN_DAYS = drug.$Days

    if (drug.$ManuallyAdded)
      group.MANUALLY_ADDED = true
  }

  return group
}

//Internal communication warning an order was shipped but not dispensed.  Gets erased when/if order is shipped
function orderDispensedNotice(order) {


  var daysAgo = 2
  var email   = { email:CINDY_EMAIL+','+DEBUG_EMAIL }

  email.subject = 'Warning Order #'+order.$OrderId+' dispensed but not shipped'
  email.message = [

    email.subject+' '+daysAgo+' day ago. Please either add tracking number to guardian or erase the "Order Failed" event.'

  ].join('<br>')

  orderDispensedEvent(order, email, daysAgo*24)
}

//We are coording patient communication via sms, calls, emails, & faxes
//by building commication arrays based on github.com/dscsa/communication-calendar
function orderShippedNotice(order, invoice) {

  var groups = groupDrugs(order)

  refillReminderNotice(order, groups)
  //autopayReminderNotice(order, groups)
  confirmShipmentNotice(order, groups)

  var numFills = groups.FILL_ACTION.length + groups.FILL_NOACTION.length
  var subject  = 'Your order '+(numFills ? 'of '+numFills+' items ' : '')+'has shipped and should arrive in 3-5 days.'
  var message  = ''

  if (groups.FILLED.length)
    message += '<br><u>These Rxs are on the way:</u><br>'+groups.FILL_ACTION.concat(groups.FILL_NOACTION).join(';<br>')+';'

  if (groups.NOFILL_ACTION.length)
    message += '<br><br><u>We cannot fill these Rxs without your help:</u><br>'+groups.NOFILL_ACTION.join(';<br>')+';'

  var email = { email:order.$Patient.email }
  var text  = { sms:getPhones(order) }

  text.message =
    subject+
    (invoice ? ' View it at '+shortLink('https://docs.google.com/document/d/'+invoice.getId()+'/pub?embedded=true')+'. ' : '') +
    'Track it at '+shortLink(trackingURL(order.$Tracking))+'. '+
    message

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
  if (invoice) email.attachments = [invoice.getId()]

  orderShippedEvent(order, email, text)
}

function refillReminderNotice(order, groups) {

  if (groups.MIN_DAYS == Infinity || ( ! groups.NO_REFILLS.length && ! groups.NO_AUTOFILL.length)) return

  var subject  = 'Good Pill cannot refill these Rxs without your help.'
  var message      = ''

  if (groups.NO_REFILLS.length)
    message += '<br><u>We need a new Rx for the following:</u><br>'+groups.NO_REFILLS.join(';<br>')+';'

  if (groups.NO_AUTOFILL.length)
    message += '<br><br><u>These Rxs will NOT be filled automatically and must be requested 2 weeks in advance:</u><br>'+groups.NO_AUTOFILL.join(';<br>')+';'

  var email = { email:order.$Patient.email }
  var text  = { sms:getPhones(order), message:subject+message }

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    'A friendly reminder that '+subject.slice(0, 1).toLowerCase()+subject.slice(1),
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
function autopayReminderNotice(order, groups) {

  var payMethod = payment(order)

  if (payMethod != payment.AUTOPAY) return

  var numFills = groups.FILL_ACTION.length + groups.FILL_NOACTION.length

  var subject  = "Autopay Reminder."
  var message  = "Because you are enrolled in autopay, Good Pill Pharmacy will be be billing your card "+order.$Card.split(/ |(?=\d)/).join(' <Pause />')+' for $'+order.$Fee+".00. Please let us right away if your card has recently changed. Again we will be billing your card for $"+order.$Fee+".00 for last month's Order #"+order.$OrderId+' of '+numFills+' items'

  var email = { email:order.$Patient.email }
  var text  = { sms:getPhones(order), message:subject+' '+message }

  text.message = subject+' '+message

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
function orderCreatedNotice(order) {

  var groups     = groupDrugs(order)
  var numFills   = groups.FILL_ACTION.length + groups.FILL_NOACTION.length
  var numNoFills = groups.NOFILL_ACTION.length + groups.NOFILL_NOACTION.length

  //['Not Specified', 'Webform Complete', 'Webform eRx', 'Webform Transfer', 'Auto Refill', '0 Refills', 'Webform Refill', 'eRx /w Note', 'Transfer /w Note', 'Refill w/ Note']
  if (order.$Patient.sourceCode == 3 || order.$Patient.sourceCode == 8) return transferRequestedNotice(order, groups)
  if ( ! numFills) return orderHoldNotice(order, groups)

  var subject  = 'Good Pill is starting to prepare '+numFills+' items for Order #'+order.$OrderId+'.'
  var message  = 'If your address has recently changed please let us know right away.'
  var drugList = '<br><br><u>These Rxs will be included once we confirm their availability:</u><br>'+groups.FILLED.join(';<br>')+';'

  if (order.$New)
    message += ' Your first order will only be $6 total for all of your medications.'

  if (numNoFills)
    drugList += '<br><br><u>We are NOT filling these Rxs:</u><br>'+groups.NOFILL_NOACTION.concat(groups.NOFILL_ACTION).join(';<br>')+';'

  var suffix = [
    "Note: if this is correct, there is no need to do anything. If you want to change or delay this order, please let us know as soon as possible. If delaying, please specify the date on which you want it filled, otherwise if you don't, we will delay it 3 weeks by default.",
    order.$Patient.medsync ? '* The goal of Med Sync is to syncronize your refill dates so that we can consolidate as many of your medications as possible into a single order, rather than sending your medications in separate orders. For this reason, this Rx may be filled for a fewer number of days in this Order before resuming to a normal number of days.' : ''
  ].join('<br><br>')

  var email = { email:order.$Patient.email }
  var text  = { sms:getPhones(order), message:subject+' '+message+drugList }

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    subject+' We will notify you again once it ships. '+message+drugList,
    '',
    (numFills >= numNoFills) ? 'Thanks for choosing Good Pill!' : 'Apologies for any inconvenience,',
    'The Good Pill Team',
    '',
    '',
    suffix
  ].join('<br>')

  orderFailedNotice(order, numFills)

  //Remove Refill Reminders for new Rxs we just received Order #14512
  removeDrugsFromEvents(order.$Patient, groups.FILLED, ['Refill Reminder'])

  //Wait 15 minutes to hopefully batch staggered surescripts and manual rx entry and cindy updates
  orderCreatedEvent(order, email, text, 15/60)
}

function transferRequestedNotice(order, groups) {

  var subject = 'Good Pill recieved your transfer request for Order #'+order.$OrderId+'.'
  var message = 'We will notify you once we have contacted your pharmacy, '+order.$Pharmacy.short.replace(/ \(\d{10}\)/g, '')+', and let you know whether the transfer was successful or not;'


  var email = { email:order.$Patient.email }
  var text  = { sms:getPhones(order), message:subject+' '+message }

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    subject,
    '',
    message,
    '',
    'Thanks!',
    'The Good Pill Team'
  ].join('<br>')

  //Wait 15 minutes to hopefully batch staggered surescripts and manual rx entry and cindy updates
  transferRequestedEvent(order, email, text, 15/60)
}

//We are coording patient communication via sms, calls, emails, & faxes
//by building commication arrays based on github.com/dscsa/communication-calendar
function orderHoldNotice(order, groups) {

  var numNoFills = groups.NOFILL_ACTION.length + groups.NOFILL_NOACTION.length

  if ( ! numNoFills) return noRxNotice(order)

  var subject = 'Good Pill is NOT filling your '+numNoFills+' items for Order #'+order.$OrderId+'.'
  var message = '<u>We are NOT filling these Rxs:</u><br>'+groups.NOFILL_NOACTION.concat(groups.NOFILL_ACTION).join(';<br>')+';'

  //['Not Specified', 'Webform Complete', 'Webform eRx', 'Webform Transfer', 'Auto Refill', '0 Refills', 'Webform Refill', 'eRx /w Note', 'Transfer /w Note', 'Refill w/ Note']
  var trigger = ''

  if (order.$Patient.sourceCode === 0 || order.$Patient.source == "SureScripts" || order.$Patient.source == "Fax" || order.$Patient.source == "Phone")
    trigger = 'We got Rxs from your doctor via '+order.$Patient.source+' but'
  else if (order.$Patient.sourceCode == 2 || order.$Patient.sourceCode == 7)
    trigger = 'You successfully registered but'
  else if (order.$Patient.sourceCode == 5)
    trigger = 'We requested refills from your doctor but have not heard back so'
  else if (order.$Patient.sourceCode == 6 || order.$Patient.sourceCode == 9)
    trigger = 'We received your refill request but'

  var email = { email:order.$Patient.email }
  var text  = { sms:getPhones(order), message:trigger+' '+subject+' '+message }

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    trigger+' '+subject,
    '',
    message,
    '',
    'Apologies for any inconvenience,',
    'The Good Pill Team',
    '',
    '',
    "Note: if this is correct, there is no need to do anything. If you think there is a mistake, please let us know as soon as possible."
  ].join('<br>')

  //Wait 15 minutes to hopefully batch staggered surescripts and manual rx entry and cindy updates
  orderHoldEvent(order, email, text, 15/60)
}

//We are coording patient communication via sms, calls, emails, & faxes
//by building commication arrays based on github.com/dscsa/communication-calendar
function orderUpdatedNotice(order, drugsChanged) {

  drugsChanged = JSON.stringify(drugsChanged) //hacky way for us to search for partial matches with indexOf (see below)
  var majorChanges = drugsChanged.split(/REMOVED FROM ORDER|ADDED TO ORDER|ADDED TO PROFILE AND ORDER/)

  if (majorChanges.length <= 1) return   //Don't renotify on small changes like QTY, DAYS, REFILLS.  Only when adding or subtracting drugs

  var groups     = groupDrugs(order)
  var numFills   = groups.FILL_ACTION.length + groups.FILL_NOACTION.length
  var numNoFills = groups.NOFILL_ACTION.length + groups.NOFILL_NOACTION.length

  //It's depressing to get updates if nothing is being filled.  So only send these if manually added and the order was just added (not just drugs changed)
  if ( ! numFills && ! groups.MANUALLY_ADDED) {
    var cancel = cancelEvents(order.$Patient, ['Order Created', 'Order Updated', 'Order Hold', 'No Rx', 'Needs Form'])
    return infoEmail('orderUpdateNotice NOT sent', order.$OrderId, 'drugsChanged', drugsChanged, 'numFills', numFills, order, groups)
  }

  var subject = 'Update for Order #'+order.$OrderId+(numFills ? ' of '+numFills+' items.' : '')
  var message = ''

  if (numFills)
    message += '<br><u>These Rxs will be included once we confirm their availability:</u><br>'+groups.FILLED.join(';<br>')+';'

  if (numNoFills)
    message += '<br><br><u>We are NOT filling these Rxs:</u><br>'+groups.NOFILL_NOACTION.concat(groups.NOFILL_ACTION).join(';<br>')+';'

  var suffix = [
    "Note: if this is correct, there is no need to do anything. If you want to change or delay this order, please let us know as soon as possible. If delaying, please specify the date on which you want it filled, otherwise if you don't, we will delay it 3 weeks by default.",
    order.$Patient.medsync ? '* The goal of Med Sync is to syncronize your refill dates so that we can consolidate as many of your medications as possible into a single order, rather than sending your medications in separate orders. For this reason, this Rx may be filled for a fewer number of days in this Order before resuming to a normal number of days.' : ''
  ].join('<br><br>')

  var email = { email:order.$Patient.email }
  var text  = { sms:getPhones(order), message:subject+message }

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    subject+' We will notify you again once it ships.',
    message,
    '',
    (numFills >= numNoFills) ? 'Thanks for choosing Good Pill!' : 'Apologies for any inconvenience,',
    'The Good Pill Team',
    '',
    '',
    suffix
  ].join('<br>')

  //Wait 15 minutes to hopefully batch staggered surescripts and manual rx entry and cindy updates
  orderUpdatedEvent(order, email, text, 15/60)

  orderFailedNotice(order, numFills) //After updated event since orderUpdatedEvent() will delete an previous orderFailed messages
}


function needsFormNotice(order, email, text, hoursToWait, hourOfDay) {

  var groups   = groupDrugs(order)
  var numFills = groups.FILL_ACTION.length + groups.FILL_NOACTION.length

  ///It's depressing to get updates if nothing is being filled
  if (numFills) {
    var subject = 'Welcome to Good Pill!  We are excited to fill your 1st Order.'
    var message = 'Your order will be #'+order.$OrderId+". Please take 5mins to register so that we can fill the Rxs we got from your doctor as soon as possible. Once you register it will take 5-7 business days before you receive your order. You can register online at www.goodpill.org or by calling us at (888) 987-5187.<br><br><u>The drugs in your 1st order will be:</u><br>"+groups.FILLED.join(';<br>')+';'
  }
  else {
    var subject = "Welcome to Good Pill. Unfortunately we can't complete your 1st Order"
    var message = "We are very sorry for the inconvenience but we can't fill the Rx(s) in Order #"+order.$OrderId+" that we received from your doctor. Please ask your local pharmacy to contact us to get the prescription OR register online or over the phone and let us know to which pharmacy we should transfer the Rx(s).<br><br>Because we rely on donated medicine, we can only fill medications that are listed here www.goodpill.org/gp-stock"
  }

  var email = { email:order.$Patient.email }
  var text  = { sms:getPhones(order), message:subject+' '+message }

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
    //A if before 10am, the first one is at 10am, the next one is 5pm, then 10am tomorrow, then 5pm tomorrow
    var hoursToWait = [0, 0, 24, 24, 24*7, 24*14]
    var hourOfDay   = [10, 17, 10, 17, 17, 17]

  } else if (hourAdded < 17){
    //A if before 5pm, the first one is 10mins from now, the next one is 5pm, then 10am tomorrow, then 5pm tomorrow
    var hoursToWait = [10/60, 0, 24, 24, 24*7, 24*14]
    var hourOfDay   = [null, 17, 10, 17, 17, 17]

  } else {
    //B if after 5pm, the first one is 10am tomorrow, 5pm tomorrow, 10am the day after tomorrow, 5pm day after tomorrow.
    var hoursToWait = [24, 24, 48, 48, 24*7, 24*14]
    var hourOfDay   = [10, 17, 10, 17, 17, 17]
  }

  needsFormEvent(order, email, text, hoursToWait[0], hourOfDay[0])

  if ( ! numFills) return //Don't hassle folks if we aren't filling anything

  needsFormEvent(order, email, text, hoursToWait[1], hourOfDay[1])
  needsFormEvent(order, email, text, hoursToWait[2], hourOfDay[2])
  needsFormEvent(order, email, text, hoursToWait[3], hourOfDay[3])
}

//We are coording patient communication via sms, calls, emails, & faxes
//by building commication arrays based on github.com/dscsa/communication-calendar
function noRxNotice(order) {

  var subject = 'Good Pill received Order #'+order.$OrderId+' but is waiting for your prescriptions'
  var message  = order.$Patient.source == 'Transfer'
    ? "We will attempt to transfer the Rxs you requested from "+order.$Pharmacy.short.replace(/ \(\d{10}\)/g, '')+"."
    : "We haven't gotten any Rxs from your doctor yet but will notify you as soon as we do."

  var email = { email:order.$Patient.email }
  var text  = { sms:getPhones(order), message:subject+'. '+message }

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    subject+'. '+message,
    '',
    '',
    'Thanks,',
    'The Good Pill Team',
    '',
    '',
    "Note: if this is correct, there is no need to do anything. If you think there is a mistake, please let us know as soon as possible."
  ].join('<br>')

  //Wait 15 minutes to hopefully batch staggered surescripts and manual rx entry and cindy updates
  noRxEvent(order, email, text, 15/60)
}

function orderFailedNotice(order, numFills) {

  var subject  = "Apologies but Good Pill is having trouble with your Order #"+order.$OrderId

  if (numFills)
    var message = "We are so sorry for the inconvenience. Please call us at (888) 987-5187 and we will explain the issue."
  else if (order.$Patient.source == 'Transfer')
    var message = "We were unable to transfer the Rxs you requested from "+order.$Pharmacy.short.replace(/ \(\d{10}\)/g, '')+". This usually happens because we have the wrong pharmacy on file, we are requesting the wrong Rxs, or your Rxs have no refills remaining"
  else
    var message = "We haven't gotten any Rxs from your doctor yet. You may want to contact your doctor.  If you had meant for us to transfer Rxs from your pharmacy instead, please login to your account and place a new 'transfer' order or give us a call at (888) 987-5187."

  var email = { email:order.$Patient.email }
  var text  = { sms:getPhones(order),  message:subject+'. '+message }

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    subject+'. '+message,
    '',
    'Thanks!',
    'The Good Pill Team',
    '',
    ''
  ].join('<br>')

  orderFailedEvent(order, email, text, 7*24, 13)
  orderFailedEvent(order, {
    email:CINDY_EMAIL+','+DEBUG_EMAIL,
    subject:'To Be Sent Tomorrow: '+subject,
    message:'To Be Sent Tomorrow: '+email.message
  }, null, 6*24, 13)
}

function confirmShipmentNotice(order, groups) {
  confirmShippingInternal(order, groups)
  confirmShippingExternal(order, groups)
}

function confirmShippingInternal(order, groups) {

  if ( ! order.$New) return

  var numFills   = groups.FILL_ACTION.length + groups.FILL_NOACTION.length
  var numNoFills = groups.NOFILL_ACTION.length + groups.NOFILL_NOACTION.length

  ///It's depressing to get updates if nothing is being filled
  var subject = "Follow up on new patient's first order"
  var daysAgo = 5

  var email = { email:'support@goodpill.org' }

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    order.$Patient.first+' '+order.$Patient.last+' '+order.$Patient.birth_date+' is a new patient.  They were shipped Order #'+order.$OrderId+' with '+numFills+' items '+daysAgo+' days ago.',
    '',
    'Please call them at '+[order.$Patient.phone1, order.$Patient.phone2]+' and check on the following:',
    '- Order with tracking number '+trackingLink(order.$Tracking)+' was delivered and that they received it',
    '',
    '- Make sure they got all '+numFills+' of their medications, that we filled the correct number of pills, and answer any questions the patient has',
    numNoFills ? '<br>- Explain why we did NOT fill:<br>'+groups.NOFILL_NOACTION.concat(groups.NOFILL_ACTION).join(';<br>')+'<br>' : '',
    '- Let them know they are currently set to pay via '+payment(order)+' and the cost of the '+numFills+' items was $'+order.$Fee+' this time, but next time it will be $'+order.$Total,
    '',
    '- Review their current medication list and remind them which prescriptions we will be filling automatically and which ones they need to request 2 weeks in advance',
    '',
    'Thanks!',
    'The Good Pill Team',
    '',
    ''
  ].join('<br>')


  confirmShipmentEvent(order, email, daysAgo*24, 9)
}

function confirmShippingExternal(order, groups) {

  var email = { email:order.$Patient.email }
  var text  = { sms:getPhones(order) }

  var subject = "Order #"+order.$OrderId+" was delivered."
  var message = " should have been delivered within the past few days.  Please contact us at 888.987.5187 if you have not yet received your order."

  text.message = subject+' Your order with tracking number '+order.$Tracking+message

  email.subject = subject
  email.message = [
    'Hello,',
    '',
    subject+' Your order with tracking number '+trackingLink(order.$Tracking)+message,
    '',
    'Thanks!',
    'The Good Pill Team',
    '',
    ''
  ].join('<br>')

  confirmShipmentEvent(order, email, 7*24, 11)
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
function trackingLink(tracking) {
  return '<a href="'+trackingURL(tracking)+'">'+tracking+'</a>'
}

function trackingFormula(tracking) {
  return '=HYPERLINK("'+trackingURL(tracking)+'", "'+tracking+'")'
}

function getPhones(order) {
  return order.$Patient.phone1+(order.$Patient.phone2 ? ','+order.$Patient.phone2 : '')
}
