function rxReceivedNotification(order, numChanges) {

  var notOrdered         = [] //These are Rxs on the patient profile (not in order) that we do NOT want to add
  var inStockRefills     = [] //These are ones we populated into the F9 Queue, we do have stock
  var rxReceivedWillFill = [] //These are the surescripts or entered calls & faxes that are in the order and that we do plan to fill
  var rxReceivedNoFill   = [] //These are the surescripts or entered calls & faxes that are in the order but we do NOT plan to fill

  var medSynced          = false //These are Rxs on the patient profile (not in order) that we might want to add

  for (var i in order.$Drugs) {
    var drug = order.$Drugs[i]
    var name = drug.$Name.replace(/[*^] /, '') //Get rid of the asterick we use for internal purposes that marks them as not in the order.

    if (drug.$SyncBy != null) medSynced = true

    //Can't figure out how to differentiate a new Rx for a refill that Cindy deleted (because it came too early) but then later added it to a refill order
    //So if there are any refills in the order I am just assuming they are all refills, otherwise we get rxReceivedWillFill and inStockRefills all mixed into one refill reminder email, e.g., Order #8473
    /*This should NOT be autopopulated {  "$Name": "GABAPENTIN 100 MG CAPSULE",  "$Msg": "is due for a refill on 2019-03-11",  "$Days": 0,  "$Qty": 270,  "$Refills": 0.28,  "$Price": 0,  "$RefillsLeft": 0.57,  "$RefillsTotal": 0.71,  "$IsRefill": 3,  "$IsDispensed": false,  "$FirstRefill": "2018-12-11",  "$LastRefill": "2018-12-11",  "$NextRefill": "2019-03-11",  "$DaysSupply": 90,  "$DispenseQty": 270,  "$WrittenQty": 630,  "$Gcn": "21413",  "$Sig": "Take 1 capsule (100 mg total) by mouth 3 (three) times daily.",  "$OrderId": "10611",  "$ScriptNo": "6004687",  "$InOrder": 0.714287,  "$InOrderId": "10611-19487-0-1001-10",  "$ScriptStatus": "Refill",  "$ScriptSource": "SureScripts",  "$RxChanged": "2018-12-11 14:34:15.520",  "$RxExpires": "2019-07-12T04:00:00.000Z",  "$Autofill": {   "rx": 1,   "patient": 1  },  "$Scripts": {   "ordered": "6004687",   "high_refills": "6001508",   "with_refills": "6001508",   "newest": "6001401"  },  "$v2": "Gabapentin 100mg",  "$TotalQty": 16418,  "$RepackQty": 135,  "$MonthlyPrice": 2,  "$Type": "Refill",  "$IsPended": false,  "$Email": "noStockRefills: ! autoPopulatedRx && ! drug.$Days" },*/

    if ( ! drug.$Days && ! drug.$InOrder) { //Some drugs might not be in order *yet* but should be medsynced (these will begin with a ^ instead of a * and should have $Days > 0)

      notOrdered.push(name+' '+drug.$Msg)
      drug.$Email = "notOrdered: ! drug.$InOrder"

    }
    else if (drug.$IsDispensed) { //Rx Received (in order but not a refill) and its close to being due

      rxReceivedWillFill.push(name+' '+drug.$Msg)
      drug.$Email = "rxReceivedWillFill: drug.$IsDispensed"

    }
    //CK doesn't want autopopulated SureScripts shopped for.  However if she added this herself then we do want it shopped.
    else if (drug.$IsRefill && drug.$Days) { //  This should include any order that was not created upon receipt of an Rx, including drugs with "AutoFill Off" that have been requested by patient

      drug.$Email = "inStockRefills: drug.$IsRefill && drug.$Days && (drug.$Stock != 'Out of Stock' || drug.$IsPended)"

      if (drug.$Stock == 'Out of Stock' && ! drug.$IsPended) {
        drug.$Email = "noStockRefills: drug.$IsRefill && drug.$Days && drug.$Stock == 'Out of Stock' && ! drug.$IsPended"
        drug.$Msg = 'may be delayed and/or filled for fewer days because we are very low in stock' //Let's do a more tentative message than our normal out of stock, since we will try harder to fill it
      }

      inStockRefills.push(name+' '+drug.$Msg)

    }
    else if (drug.$NextRefill == 'AutoRefill Off') {  //This only catches "Autorefill Off" that are (1) In Order & (2) No First Fill (eg, Doctor sent over a new script rather than us populating it)

      if (drug.$Days) {
        rxReceivedWillFill.push(name+' '+drug.$Msg)
        drug.$Email = "rxReceivedWillFill: drug.$NextRefill == 'AutoRefill Off' && drug.$Days)"
      } else {
        rxReceivedNoFill.push(name+' '+drug.$Msg)
        drug.$Email = "rxReceivedNoFill: drug.$NextRefill == 'AutoRefill Off' && ! drug.$Days)"
      }

    }
    else if (drug.$Days) { //Rx Received (in order but not a refill) and its close to being due.

      rxReceivedWillFill.push(name+' '+drug.$Msg)
      drug.$Email = "rxReceivedWillFill: drug.$Days"

    }
    else {
      if (drug.$AddedToOrderBy != "HL7") debugEmail('Manually added drug in Order but no days!  Why is this?',drug, order) //Most likely an autopopulated Rx that is not due yet
      drug.$Email = "rxReceivedNoFill: default. Old Msg: "+drug.$Msg+" Old Days:"+drug.$Days
      rxReceivedNoFill.push(name+' '+drug.$Msg)
    }
  }

  //These IF statements are in ASCENDING order of importance e.g. latter email subjects will override prior ones.
  var emailAddress = order.$Patient.email
  var emailSubject = ''
  var emailBody    = []
  var emailSuffix  = []
  var delayText    = "Note: if this is correct, there is no need to do anything. If you want to change or delay this order, please let us know as soon as possible. If delaying, please specify the date on which you want it filled, otherwise if you don't, we will delay it 3 weeks by default."
  var shipText     = " for shipment. Below are all the prescription(s) that we will include in your order once we confirm their availability."

  var allDrugsInOrder = inStockRefills.concat(rxReceivedWillFill).sort(sortByMsg)

  if (rxReceivedNoFill.length  || (allDrugsInOrder.length && notOrdered.length)) { //Don't send email if the only drugs are notOrdered because that's just depressing

    emailSubject = 'We are not filling some of your prescription(s)'
    emailBody    = ['Below are prescription(s) that we have but are not going to fill right now:', rxReceivedNoFill.concat(notOrdered).sort(sortByMsg).join(',<br>')].concat(emailBody)

    if ( ! numChanges) {
      order.$FirstCall = addTime(10/60)
      scheduleCalls(order, 'Rx Received No Fill', removeDelimiters(rxReceivedNoFill.concat(notOrdered).sort(sortByMsg).join('; ')), '', true)
    }
  }

  if (inStockRefills.length) {

    emailSubject = 'We are preparing your refills in Order #'+order.$OrderId
    emailBody    = [emailSubject+shipText, allDrugsInOrder.join(',<br>')].concat(emailBody)

    if ( ! numChanges) {
      order.$FirstCall = addTime(10/60)
      scheduleCalls(order, 'Refill Reminder', removeDelimiters(allDrugsInOrder.sort(sortByMsg).join('; ')), '', true)
    }
  }
  else if (rxReceivedWillFill.length) {

    emailSubject = 'We received prescription(s) from your doctor and are preparing Order #'+order.$OrderId
    emailBody    = [emailSubject+shipText, allDrugsInOrder.join(',<br>')].concat(emailBody)

    if ( ! numChanges) {
      order.$FirstCall = addTime(10/60)
      scheduleCalls(order, 'Rx Received Will Fill', removeDelimiters(allDrugsInOrder.join('; ')), '', true)
    }
  }

  if (numChanges && emailSubject) { //don't send an update email unless there is content

    emailBody[0] = emailBody[0].replace(/.*?\./, 'Your Order #'+order.$OrderId+' had '+numChanges+' medication change(s).') //replace first sentence with order update
    emailSubject = 'Your Order #'+order.$OrderId+' has been updated'
    emailSuffix.unshift(delayText)

    var drugs = removeDelimiters(allDrugsInOrder.join('; '))

    if ( ! order.$OrderId || ! allDrugsInOrder.length) //See Order #8910
      return debugEmail('Order Updated BUT Email Not Sent', '#'+order.$OrderId, drugs, 'notOrdered', notOrdered, 'medSynced', medSynced, 'inStockRefills', inStockRefills, 'rxReceivedWillFill', rxReceivedWillFill, 'rxReceivedNoFill', rxReceivedNoFill)
    else {
      order.$FirstCall = addTime(10/60)
      scheduleCalls(order, 'Order Updated', order.$OrderId, drugs, true)
    }

    //Debug Code
    //emailAddress = 'adam@sirum.org'
    //emailSuffix.unshift(JSON.stringify(order, null, ' '))
  }
  else if (rxReceivedWillFill.length || inStockRefills.length) {  //I think we don't want to send an email if only MedSynced, which is why I don't use allDrugsInOrder here

    emailBody[0] += ' Within the next 1-3 business days, you will receive another email that confirms your order was shipped and provides its tracking number.'
    emailSuffix.unshift(delayText)

    if (medSynced) //Only add medsync if we are sending them something
      emailSuffix.push('* The goal of Med Sync is to syncronize your refill dates so that we can consolidate as many of your medications as possible into a single order, rather than sending your medications in separate orders. For this reason, this Rx may be filled for a fewer number of days in this Order before resuming to a normal number of days. ')
  }

  if ( ! emailSubject)
    return infoEmail('No emailSubject for rxReceivedNotification, likely because we are requesting autorequesting refills from the doctor', order, 'notOrdered', notOrdered, 'medSynced', medSynced, 'inStockRefills', inStockRefills, 'rxReceivedWillFill', rxReceivedWillFill, 'rxReceivedNoFill', rxReceivedNoFill)//don't contact or update for empty orders

  infoEmail('Patient rxReceivedNotification', emailBody.join('<br><br>').replace(/ undefined/g, ''), order, 'notOrdered', notOrdered, 'medSynced', medSynced, 'inStockRefills', inStockRefills, 'rxReceivedWillFill', rxReceivedWillFill, 'rxReceivedNoFill', rxReceivedNoFill)

  //emailAddress = 'adam@sirum.org'
  sendEmail(emailAddress, emailSubject, [ //
    'Hello,',
    '',
    emailBody.join('<br><br>').replace(/ undefined/g, ''), //Remove any $Msg === undefined
    '',
    (allDrugsInOrder.length >= (notOrdered.length + rxReceivedNoFill.length)) ? 'Thanks!' : 'Apologies for any inconvenience,',
    'The Good Pill Team',
    '',
    emailSuffix.join('<br><br>')
  ])

  updateWebformReceived(order.$OrderId, order.$Patient.guardian_id, 'processing') //take it out of awaiting-rx or awaiting-transfer

}

function sortByMsg(drug1, drug2) {

  var msg1 = drug1.match(/[a-z].*/)
  var msg2 = drug2.match(/[a-z].*/)

  if(msg1 < msg2) { return -1 }
  if(msg1 > msg2) { return  1 }
  return 0
}

/*
function inOrder(drug) {
  return drug.$InOrder
}

function includedFilter(drug) {
  return drug.$Days !== 0
}
*/
