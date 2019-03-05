//Guardian automatically adds new SureScripts to the F9 queue even if the doctor sent them in before the Rx was due
//We don't want these early Rxs to trigger a refill reminder just a short note letting the pastient know (similar to rxReceived but not filling it)
//If 

/*
function refillReminder(order) {
  
  var refills  = []
  var received = []
  var medsync  = []
  var syncDays = []
  
  var receivedMsg = ''
  var refillsMsg  = ''
  var subject     = ''

  for (var i in order.$Drugs) {
    var drug = order.$Drugs[i]
        
    var syncDays   = (new Date(drug.$NextRefill) - new Date())/1000/60/60/24    
    
     //TODO these patient communications need to be sinked with v2 shopping.  Right now we use different logic (in syncDays)
     //so we are pending quantities in v2 even though we are telling patient that we are not filling them
    if (drug.$Refills <= 0) {
      //Could be a pending or denied surescript refill request (order 7236) so need to make sure refills are available
      //OR one drug was given more refills but the other drugs were not
      infoEmail('Refill Reminder but there are 0 refills', 'drug', drug, 'syncDays', syncDays, 'order', order)
      continue
    }
    else if (drug.$InOrder && syncDays <= 15)
      refills.push(drug.$Name+(drug.$Days ? '' : ' '+drug.$Msg))
    else if (drug.$InOrder && drug.$NextRefill == 'AutoRefill Off') //Someone called in to request a med off autofill or a doctor sent one in (not sure if we should send the latter but better safe than sorry???).
      refills.push(drug.$Name+' '+drug.$Msg) //"was recently requested to be filled."
    else if (drug.$InOrder) {  //this is likely a doctor's early surescript fill.  
      
      if ( ! drug.$Days) {
        debugEmail('Refill Reminder: But no $Days?', drug.$Msg, drug, order)
        drug.$Msg = drug.$Msg
      }
      else if (syncDays) //NaN is falsey
        drug.$Msg = 'scheduled to be refilled on '+drug.$NextRefill
      else {
        debugEmail('Refill Reminder: What happened here?', 'drug.$Msg = "has '+drug.$NextRefill+'"', drug, order)
        drug.$Msg = 'has '+drug.$NextRefill // N/A
      }
        
      received.push(drug.$Name+' '+drug.$Msg)
      
    } else if (syncDays >= 0 && syncDays <= 15 && (drug.$WrittenQty < drug.$TotalQty)) {
      drug.$Msg = 'should be added to order and med synced'
      medsync.push(drug.$Name.replace('* ', ''))
    }
  }
  
  if ( ! refills.length && ! received.length) return
  
   if (received.length) {
    
    subject = 'We just got more refills from your doctor'
   
    order.$FirstCall = addTime(5/60)
    scheduleCalls(order, 'Rx Received No Fill', removeDelimiters(received.join('; ')), 'doctor', true)
    
    receivedMsg = 'Below are prescription(s) that are not due to be filled, please contact us if you need them:<br>'+received.join(',<br>')+'<br>'
  }
      
  if (refills.length) {
    
    subject = 'We preparing the refills below for Order #'+order.$OrderId //this will overwrite the received.length subject if it was set
    
    setCallTimes(order)
    scheduleCalls(order, 'Refill Reminder', removeDelimiters(refills.join('; ')), '', true)
    
    refillsMsg  = subject+':<br>'+refills.join(',<br>'),
    refillsMsg += "<br><br>If you do want these refills, there is no need to do anything - we will email you with tracking information once your order ships. If you want to postpone your refills, please let us know as soon as possible how many weeks you would like to delay them; if you don't specify, we will postpone them 3 weeks by default.<br>"
  }
  
  sendEmail(order.$Patient.email, subject, [
    'Hello,',
    '',
    refillsMsg,
    receivedMsg,
    'Thanks!',
    'The Good Pill Team',
    '',
    '',
    medsync.length ? 'Note: '+medsync.join('; ')+' may be included as part of our Med Sync program. The goal of Med Sync is to syncronize your refill dates so that we can consolidate as many of your medications as possible into a single order, rather than sending your medications in separate orders.' : ''
  ])  
}

//We move a 45 day fill back to a 90 day fill when an item is no longer low in stock.  However, if all other drugs are on 90 days, this one drug that is back on 90 days will be off-cycle (45 day shifted).  Ideally we want to fill it 45 days twice (even though the 2nd fill is high stock) so that when it switches back to 90 it remains in sync with the other drugs.    
//if (stockChanged) debugEmail('stockChanged', stockChanged+' -> '+(stockChanged && ! (drug.$IsRefill % 2)), "drug.$IsRefill", drug.$IsRefill, "lowStock && (drug.$DaysSupply > 45)", lowStock && (drug.$DaysSupply > 45), "! lowStock && (drug.$DaysSupply < 90)", ! lowStock && (drug.$DaysSupply < 90), drug)
//stockChanged = stockChanged && ! (drug.$IsRefill % 2)
/*
function setSyncDaysOld(order, drug) {
  
 setSyncDaysNew(order, drug)
  
 if (drug.$Type == 'Dispensed' || ! drug.$Days || drug.$NextRefill == 'N/A' || drug.$Name.match(/\bINH/)) return
 
 //Synced Days - Regular Days = Actual Order Added - Estimated Order Added
 drug.$SyncBy = new Date(drug.$NextRefill) - order.$OrderAdded
 drug.$SyncBy = Math.round(drug.$SyncBy/1000/60/60/24) || 0 // Default to 0 since Undefined !< Number
 
 //Do_AutoRefill2 is currently set at 11 days so min is at least 11 days. Don't sync those but sync ones that cindy adds manually
 if (drug.$SyncBy < 15) {
   if (drug.$SyncBy <= 11) delete drug.$SyncBy //Don't clutter sheet since inconsequential
   return //Don't add if SyncBy is less than this min days.
 }
 
 var SyncDays = drug.$Days - drug.$SyncBy
 var SureScriptRefill = drug.$ScriptStatus == 'SureScripts' && drug.$IsRefill  //new SureScript Rx.  This will not catch 2nd or more fills on a surescript because those will have ScriptStatus of "Refill"
 //Cindy request set to either 30, 45, 60, or 90. Make sure to round down so we don't overfill an Rx.
 if (SyncDays < 15 || SureScriptRefill) //Don't fill if the result would be a less than a 15 days supply or this is a new SureScript for a refill drug that was sent in early
   drug.$SyncBy  = drug.$Days - 0
 else if (SyncDays < 45)  //15 < Days < 45 = 30 Days. 
   drug.$SyncBy = drug.$Days - 30
 else if (SyncDays < 60) //45 < Days < 60 = 45 Days.  
   drug.$SyncBy = drug.$Days - 45
 else if (SyncDays < 90) //60 < Days < 90 = 60 Days.
   drug.$SyncBy = drug.$Days - 60
 else if (SyncDays < 135) //90 < Days < 135 = 90 Days. Not sure the use case here?  Should we just finish up the Rx?
   drug.$SyncBy = drug.$Days - 90
 
 //This is to sync for the shortest day, which is easier than the longest day.  
 drug.$Msg    = (SureScriptRefill ? 'new Rx from your doctor but refill is not due until ': 'was med synced for a next refill on ')+drug.$NextRefill
 drug.$Price -= Math.round(drug.$SyncBy * drug.$Price/drug.$Days)
 drug.$Qty   -= Math.round(drug.$SyncBy * drug.$Qty/drug.$Days)
 drug.$Days  -= drug.$SyncBy
}*/
