
function orderShippedNotification(order, invoice, drugs) {
    
  order.$FirstCall = addTime(5/60)
  
  var invoiceLink  = 'https://docs.google.com/document/d/'+invoice.getId()+'/pub?embedded=true'
  
  //Now that we use URL shortener we no longer have to add dashes to tracking# so that reminder call does think they are phone numbers.  
  //Did trial and error and a dash every 5 digits was the minimum amount needed for reminder call to work e.g., tracking#.replace(/(\d{5})/g, '$1-')
  var smsText = 'View it at '+shortLink(invoiceLink)+'. Track it at '+shortLink(trackingURL(order.$Tracking)) //Short Links to fit with the 160 character limit
  
  scheduleCalls(order, 'Order Shipped', removeDelimiters(smsText), order.$OrderId)
        
  //if ( ! address.email) return
  
  var warning  = []
  var unfilled = drugs.filter(excludedFilter).map(drugNameMsgMap)
  
  var numFills  = drugs.length - unfilled.length
  
  var subject = 'Your order of '+numFills+' items has shipped'
  
  if (false) { //unfilled.length) { Remove until we get this correct
    warning.push('The following medications were NOT filled:<br>'+unfilled.join('<br>'))
  }
  
  var minDays   = 90
  var noRefills = drugs
    .filter(function(drug) { return drug.$Refills < 1 && drug.$Days })
    .map(function(drug) { minDays = Math.min(minDays, drug.$Days); return drugNameMap(drug) })
  
  if (noRefills.length) {
    warning.push('The medications below were included in your order but need more refills, please contact your doctor about:<br>'+noRefills.join('<br>'))
    var reminderTime = addTime(24*(minDays-3)+16.5, null, true) //4:30pm 3 days before refill date (same as refills).  Current thought on timeline is SureScript Refill Auth -> 1 day to hear answer -> 0 Refill Reminder -> Rest of Refills Populated -> 1 day -> Filled & Shipped 
    var smsDrugs = removeDelimiters(noRefills.join('; '))
    //cancelFutureCalls(order) //looking at calendar trash this is also deleting necessary events, so going back to duplicates for now. Prevent duplicates that were happening.  Not sure why
    newCallEvent(order, reminderTime, '0 Refills', order.$OrderId, smsDrugs)
  }
  
  sendEmail(order.$Patient.email, subject, [
    'Hello,',
    '',
    'Thanks for choosing Good Pill Pharmacy. '+subject+' and should arrive in 3-5 days.',
    '',
    'Your receipt for order <strong>#'+order.$OrderId+'</strong> is attached. Your tracking number is '+trackingLink(order.$Tracking)+'.',
    'Use this link to request delivery notifications and/or provide the courier specific delivery instructions.',
    warning.length ? '<br>'+warning.join('<br><br>') : '',
    '',
    'Thanks!',
    'The Good Pill Team',
    '',
    ''  
  ],[
    invoice.getAs(MimeType.PDF)
  ])
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

function trackingLink(tracking) {
  return '<a href="'+trackingURL(tracking)+'">'+tracking+'</a>'
}

function trackingFormula(tracking) {
  return '=HYPERLINK("'+trackingURL(tracking)+'", "'+tracking+'")'
}
 
function excludedFilter(drug) { 
  return drug.$Days === 0
}

function drugNameMap(drug) { 
  
  if (drug.$Name[0] != '*' && drug.$Name[0] != '^')
    return drug.$Name 
    
  return drug.$Name.slice(2)
}

function drugNameMsgMap(drug) { 
  return drugNameMap(drug)+(drug.$Msg ? ' '+drug.$Msg : '')
}



