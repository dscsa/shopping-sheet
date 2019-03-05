function missingRx(order) {
  
  if (order.$Patient.source == 'Transfer') {
    var type   = 'Transfer Failed'
    var first  = 24*6+11
    var drugs  = null //These are in the preorder once we get rid of preorder and have transfer drugs in the regular order, we can list the drugs in the sms.
    /*var subject = 'we are having trouble with your transfer request' 
    sendEmail(subject, [
    'Hello,',
    '',
    'Our apologies but your order '+order.$OrderId+' is delayed because '+subject+'. Please contact us at (888) 987-5187.',
    '',
    'Thanks and sorry for the inconvenience!',
    'The Good Pill Team',
    '',
    ''  
    ])*/
    
    //
  }
  else {
    var type   = 'Missing eRX'
    var first  = 24*5+11
    var drugs  = null ///we don't know because we don't ask patient to specify
    infoEmail('Missing eRX Calendar Event', type, first, order)
    /*var subject = 'we have not yet received prescription(s) from your doctor' 
    sendEmail(subject, [
    'Hello,',
    '',
    'Our apologies but your order '+order.$OrderId+' is delayed because '+subject+'. Please contact your doctor and get them to (re)send the prescriptions.',
    '',
    'Thanks and sorry for the inconvenience!',
    'The Good Pill Team',
    '',
    ''  
    ])*/
  }
  
  order.$FirstCall = getCallTime(order, first, true)
  //order.$SecondCall = getCallTime(order, first+24, true)

  
  scheduleCalls(order, type, drugs, order.$OrderId)
}
