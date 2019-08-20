//WE SYNC IN TWO WAYS
//1) [setDays]: If we have an order, we will pull in drugs that are not yet in the order but are due soon (the notInOrder * is replaced with a ^)
//2) [getSyncDate, setSyncDays]: For drugs in the order we will adjust their fill days from the default of 90 to be between 30-120 days

//These are based on MSSQL SP of 3 days and 7 day buffer for 1st fills
function maxMedSyncDays(drug) {
  return 15
}

//These are based on MSSQL SP of 3 days and 10 day buffer for 1st fills
function minMedSyncDays(drug) {
  return (drug.$IsRefill == 1 ? 11 : 3)
}

function roundDate(date, roundBy) {
  date = new Date(date+'T00:00:00') ///Other 2019-05-01 can appear as 2019-04-30 because of UTC

  var dayOfMonth = date.getDate()

  dayOfMonth = Math.floor(dayOfMonth/roundBy)*roundBy+1 //ceil since better to sync a few more days then too few days

  date.setDate(dayOfMonth)

  return date.toJSON().slice(0, 10)
}

//This does not affect drugs Not In Order with NextRefill <= MED_SYNC_DAYS.  That is handled in Live Inventory's OutOfStock.
//This function is for drugs that are In Order with NextRefill > MED_SYNC_DAYS, so that we can adject their quantities appropriately
//DON'T sync drugs NOT IN ORDER (ie early) because Guardians won't add the extra days to the old refill date, it will just set the refill date to today so they will just get extra medicine.  For example Drug 1 on Jan 1 for 90 days.  You DONT want to add Drug 2 to the Order even though its due on Feb and you can add it for only 60 days, altough qty wise this works (both Drug 1 & 2 should be due in April 1st) because Guardian will set fill date for Drug 2 as Jan 1 and refill date will still be set to Jan 1st + 60 days = March 1st.
//We ONLY want this on the firstfill of an Rx, otherwise we want to keep the quantities consistent


//SYNC to the date with the most drugs witth (30-120 days), not the date that is the furtest away. This is because CK said if 5 drugs in order and one drug due 30 days from now, rather than sync those 5 to 30 days, she would rather fill all those at 90 and then sync the next drug when it gets filled to 60 days
//In other words she only wants to sync when numDrugsBeingSynced < numDrugsSyncedTo
function setSyncDate(order, drug) {

  var p = order.$Patient
  p.syncDates = p.syncDates || { inOrder:0 } //Count how many drugs have each NextFill date
  p.syncDate  = p.syncDate  || ['', 0]   //Explicit 0 fixed JS quirk when using ">" with undefined


  //Only keep "MAY MEDSYNC" and "PAST DUE" in order if there is at least one other script to be filled AND the order hasn't been dispensed yet
  var excludeMedSynced = ! p.syncDates.inOrder || ~ ['Dispensed', 'Shipped'].indexOf(order.$Status)

  //We can do keep accurate check of p.syncDates.inOrder within the loop as long as loop's drug order sorted by InOrder == true first
  if (hasDrugStatus(drug, 'NOACTION_MAY_MEDSYNC') && excludeMedSynced){
    set0Days(drug)
    setDrugStatus(drug, 'NOACTION_NOT_DUE')
  }
  else if (hasDrugStatus(drug, 'NOACTION_PAST_DUE') && excludeMedSynced){
    set0Days(drug)
    //Keep status the same for now
  }
  else if (hasDrugStatus(drug, 'NOACTION_MAY_MEDSYNC') && p.syncDates.inOrder) {
    p.medsync = true
    p.syncDates.inOrder++
    drug.$Name = drug.$Name.replace('*', '^')
  }
  else if (hasDrugStatus(drug, 'NOACTION_PAST_DUE') && p.syncDates.inOrder) {
    p.medsync = true
    p.syncDates.inOrder++
    drug.$Name = drug.$Name.replace('*', '^')
  }
  else if (hasDrugStatus(drug, 'NOACTION_WAS_MEDSYNC')) {
    p.medsync = true
    p.syncDates.inOrder++
  }
  else if (drug.$Days)
    p.syncDates.inOrder++

  if (drug.$Days) {
    var newDays  = drug.$Days
    var nextFill = addHours(drug.$Days*24, drug.$NextRefill).toJSON().slice(0, 10)
  }
  else {
    var newDays  = drug.$DaysToRefill
    var nextFill = drug.$NextRefill

    //#14191 if only one drug in order don't sync it with itself. Might be a simpler fix but can't think
    //of it right now. For now, determine this by seeing if 1st drug has days and the 2nd drug has no days
    if (p.syncDates.inOrder == 1 && order.$Drugs.indexOf(drug) == 1)
      p.syncDate = ['', 0, 'reset']
  }

  //$LastFill == "" means we have N/A for next_fill but still want to count it as a potential sync date. #11272 3 new surescipts were being synced to only 2 old sure scripts
  //21 is the smallest number that would get rounded to 30 with our current rounding function: Math.ceil((newDays-5)/15)*15
  if (newDays >= 21 && newDays <= 120 && drug.$Autofill.rx) {
    var nextFill = roundDate(nextFill, 7) //TODO we actually care about how "close" dates are. Right now 2019-05-13 would round to 2019-05-01 and 2019-05-16 would round to 2019-05-15 even though they should be grouped together
    p.syncDates[nextFill] = p.syncDates[nextFill] || 0
    p.syncDates[nextFill]++

    //Keep Track of the Most Common Date, if a tie chose the furthest out
    var moreCommon = p.syncDates[nextFill] > p.syncDate[1]
    var futherOut  = (p.syncDates[nextFill] == p.syncDate[1]) && nextFill > p.syncDate[0]
    if (moreCommon || futherOut) {
      p.syncDate[0] = nextFill
      p.syncDate[1] = p.syncDates[nextFill]
    }
  }
}

function setSyncDays(order, drug) {

  var p = order.$Patient

  if (drug.$IsDispensed || ! drug.$Days || p.syncDates.inOrder > p.syncDate[1]) return

  var oldDays = drug.$Days

  //Order 15043 Gabapentin had a  next refill date that had already passed (Days to Refill was negative) which caused it to be synced to over 120 days
  var newDays = (new Date(p.syncDate[0]) - new Date(drug.$DaysToRefill > 0 ? drug.$NextRefill : order.$OrderAdded))/1000/60/60/24

  newDays = Math.ceil((newDays-5)/15)*15   //Cindy wants us to round up to the nearest 15 days.  For rounding to 15, I don't want an equal Math.round() since I would want to error on giving people more than less but not quite just Math.ceil(), instead I do Math.ceil(x-5) because I want 66-80 -> 75, and 81-95 -> 90

  var daysLeftInRx = Math.round(drug.$WrittenQty * drug.$RefillsLeft * drug.$Days / drug.$Qty, 0)

  if (newDays <= 0 || newDays == oldDays || newDays > daysLeftInRx || oldDays == daysLeftInRx) return //debugEmail('Cannot Sync: not enough days left in the Rx', 'newDays', newDays, 'daysLeftInRx', daysLeftInRx, order)

  drug.$Days   = newDays
  drug.$SyncBy = newDays - oldDays
  drug.$Qty    = Math.round(drug.$Days * drug.$Qty/oldDays)

  p.medsync = true
  drug.$NextRefill = p.syncDate[0]
  setDrugStatus(drug, 'NOACTION_MEDSYNC_TO_DATE')
}
