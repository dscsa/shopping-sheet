//These are based on MSSQL SP of 3 days and 7 day buffer for 1st fills
function maxMedSyncTime(drug) {
  return (drug.$IsRefill == 1 ? 21 : 14)*24*60*60*1000
}

//These are based on MSSQL SP of 3 days and 10 day buffer for 1st fills
function minMedSyncTime(drug) {
  return (drug.$IsRefill == 1 ? 11 : 3)*24*60*60*1000
}

//This does not affect drugs Not In Order with NextRefill <= MED_SYNC_DAYS.  That is handled in Live Inventory's OutOfStock.
//This function is for drugs that are In Order with NextRefill > MED_SYNC_DAYS, so that we can adject their quantities appropriately
//DON'T sync drugs NOT IN ORDER (ie early) because Guardians won't add the extra days to the old refill date, it will just set the refill date to today so they will just get extra medicine.  For example Drug 1 on Jan 1 for 90 days.  You DONT want to add Drug 2 to the Order even though its due on Feb and you can add it for only 60 days, altough qty wise this works (both Drug 1 & 2 should be due in April 1st) because Guardian will set fill date for Drug 2 as Jan 1 and refill date will still be set to Jan 1st + 60 days = March 1st.
//We ONLY want this on the firstfill of an Rx, otherwise we want to keep the quantities consistent

function setSyncDays(order, drug) {
  
  if (drug.$IsDispensed || ! drug.$Days || order.$Drugs.length == 1 || ! order.$Drugs.reduce(function(sum, drug) { return +drug.$Days+sum }, 0)) return //Cindy asked for this but I am not sure || drug.$Type != "Estimate"
   
  var lastRefillDate
  var orderAdded = new Date(order.$OrderAdded)/1000/60/60/24
  var nextRefill = new Date(drug.$NextRefill)/1000/60/60/24
    
  var daysLeftInRx = Math.round(drug.$WrittenQty * drug.$RefillsLeft * drug.$Days / drug.$Qty, 0)
  
  drug.$SyncDates = [] 
  
  //Now search for any better
  for (var i in order.$Drugs) {
    
    if (order.$Drugs[i].$NextRefill.split('-').length != 3) continue
    
    var newDays = new Date(order.$Drugs[i].$NextRefill)/1000/60/60/24 - orderAdded
    
    drug.$SyncDates.push(order.$Drugs[i].$NextRefill+' --> '+newDays.toFixed(0))
    
    newDays = Math.ceil((newDays-5)/15)*15   //Cindy wants us to round up to the nearest 15 days.  For rounding to 15, I don't want an equal Math.round() since I would want to error on giving people more than less but not quite just Math.ceil(), instead I do Math.ceil(x-5) because I want 66-80 -> 75, and 81-95 -> 90
    
    if (newDays > daysLeftInRx || newDays < 30 || newDays > 120 || drug.$SyncBy >= newDays - drug.$Days) continue //Min & Max Days
    
    drug.$SyncBy   = newDays - drug.$Days //this will be the most positive number between 30 and Math.min(120, daysLeftInRx)
    lastRefillDate = order.$Drugs[i].$NextRefill
  }
  
  if ( ! drug.$SyncBy) return infoEmail('setSyncDaysNew NOT Synced because no valid SyncBy was found', drug.$Name, "lastRefillDate", lastRefillDate, "$NextRefill",  drug.$NextRefill, "$Days", drug.$Days, "$SyncBy", drug.$SyncBy, "drug", drug, "order", order)
  //if (nextRefill - orderAdded < MED_SYNC_DAYS) return infoEmail('setSyncDaysNew NOT Synced because nextRefill is within MED_SYNC_DAYS', drug.$Name, "lastRefillDate", lastRefillDate, "$NextRefill",  drug.$NextRefill, "$Days", drug.$Days, "$SyncBy", drug.$SyncBy, "drug", drug, "order", order) //Don't just use Date() because that will change overtime and therefore change SyncBy

  var oldDays  = drug.$Days
  drug.$Days  += drug.$SyncBy
  //drug.$Name   = drug.$Name.replace('*', '^')
  drug.$Msg    = (drug.$InOrder ? 'will be' : 'may be')+' Med Synced to '+lastRefillDate+' *'
  drug.$Price  = Math.round(drug.$Days * drug.$Price/oldDays)
  drug.$Qty    = Math.round(drug.$Days * drug.$Qty/oldDays)
  
  infoEmail('setSyncDaysNew Synced', drug.$Name, "lastRefillDate", lastRefillDate, "$NextRefill",  drug.$NextRefill, "$Days", oldDays+' --> '+drug.$Days, "$SyncBy", drug.$SyncBy, "drug", drug, "order", order)
}

/*
function setSyncDays(order, drug) {
  
  if (drug.$IsDispensed || ! drug.$Days || ! drug.$Refills || ! drug.$InOrder || order.$Drugs.length < 2) return
  
  //Copied from Patient Rx Notification.  In case Cindy accidentally adds a drug to order that should not be there
  var daysUntilRefill   = (new Date(drug.$NextRefill) - new Date())/1000/60/60/24 
  if (daysUntilRefill <= MED_SYNC_DAYS) return //  < MED_SYNC_DAYS then this is handled by Live Inventory and doesn't need qty adjustment
    
  var oldDays     = drug.$Days
  var nextRefills = order.$Drugs.map(function(drug, i) { 
    //Ignore Rxs with no NextRefill e.g., Rx Expiring/Rx Expired/Transferred Out/No Refills
    return drug.$NextRefill.split('-').length == 3 ? drug.$NextRefill : ''
  })

  var lastRefillDays = 45
  var nextRefillDate = nextRefills[order.$Drugs.indexOf(drug)]
  var lastRefillDate = nextRefills.reduce(function(lastRefillDate, nextRefill, i) {
    
    if (nextRefill <= lastRefillDate) return lastRefillDate
    //debugEmail('setSyncDaysNew reduce', lastRefillDate, nextRefill, i, order.$Drugs[i].$Days, order.$Drugs[i].$DaysSupply, order.$Drugs[i].$Days || order.$Drugs[i].$DaysSupply, order.$Drugs[i])
    lastRefillDays = order.$Drugs[i].$Days || order.$Drugs[i].$DaysSupply
    return nextRefill
  }, '')
  
 if ( ! lastRefillDate || nextRefillDate == lastRefillDate) return infoEmail('setSyncDaysNew NOT Synced because cannot determine target sync date', drug.$Name, "lastRefillDate", lastRefillDate, "$NextRefill",  drug.$NextRefill+' -> '+nextRefillDate, "$NextRefills", nextRefills, "order", order)
  
 //Synced Days - Regular Days = Actual Order Added - Estimated Order Added
 drug.$SyncBy = new Date(lastRefillDate) - new Date(nextRefillDate)
 drug.$SyncBy = Math.round(drug.$SyncBy/1000/60/60/24) || 0 //Convert milliseconds to days. Default to 0 since Undefined !< Number
 
 var newDays   = drug.$SyncBy
 var extraDays = (lastRefillDays - 1) % 45 + 1
 
 //Put upper and lower limits on the total amount we fill
 //Eg. if other drug is filled in 30 days, then fill this one for 120 days so you can fill that one for 90 days.  However if the other drug is to be refilled in 60 days, then fill this one for 60 days so you can fill both for 90 days in 60 days. 
 if (extraDays && newDays <= 45) {
   newDays += extraDays
   lastRefillDate += ' +'+extraDays+' days'
 }
   
 //Cindy wants us to round up to the nearest 15 days.  For rounding to 15, I don't want an equal Math.round() since I would want to error on giving people more than less but not quite just Math.ceil(), instead I do Math.ceil(x-5) because I want 66-80 -> 75, and 81-95 -> 90
 newDays = Math.ceil((newDays-5)/15)*15
 
 if (newDays == oldDays) return
 
 //Problem that we could be syncing more than is left in an Rx (Order #9317 originally had 315 qty > 270 left in rx)
 var days_left_in_rx = Math.round(drug.$WrittenQty * drug.$RefillsLeft * drug.$Qty / oldDays, 0)
 var maxDays = Math.min(120, days_left_in_rx)
 
 if (newDays > maxDays) {
   infoEmail('Sync Days > days_left_in_rx', 'newDays', newDays, 'oldDays', oldDays, "days_left_in_rx", days_left_in_rx, 'maxDays', maxDays, drug.$WrittenQty+' * '+drug.$RefillsLeft+' * '+drug.$Qty+' / '+oldDays, drug)
   newDays = maxDays
 } 
    
 //This is to sync for the shortest day, which is easier than the longest day.  
 drug.$Msg    = 'was to be refilled on '+drug.$NextRefill+' but was Med Synced to '+lastRefillDate+' *'
 drug.$Price  = Math.round(newDays * drug.$Price/oldDays)
 drug.$Qty    = Math.round(newDays * drug.$Qty/oldDays)
 drug.$Days   = newDays
 
 infoEmail('setSyncDaysNew Synced', drug.$Name, "lastRefillDate", lastRefillDate, "$NextRefill",  drug.$NextRefill+' -> '+nextRefillDate, "$NextRefills", nextRefills, "$Days", drug.$Days, "$SyncBy", drug.$SyncBy, "oldDays", oldDays, "newDays", newDays, "drug", drug, "order", order)
}
*/

/*
function dateInXdays(days) {
   return new Date(new Date().getTime()+days*24*60*60*1000)
}
*/
