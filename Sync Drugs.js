//WE SYNC IN TWO WAYS
//1) [setDays]: If we have an order, we will pull in drugs that are not yet in the order but are due soon (the notInOrder * is replaced with a ^)
//2) [getSyncDate, setSyncDays]: For drugs in the order we will adjust their fill days from the default of 90 to be between 30-120 days

//These are based on MSSQL SP of 3 days and 7 day buffer for 1st fills
function maxMedSyncDays(drug) {
  return 14
}

//These are based on MSSQL SP of 3 days and 10 day buffer for 1st fills
function minMedSyncDays(drug) {
  return (drug.$IsRefill == 1 ? 11 : 3)
}

function roundDate(date, drug) {
  date = date.split('-')
  var roundBy = maxMedSyncDays(drug)
  Math.floor(date[2]/roundBy)*roundBy
  return date.join('-')
}

//This does not affect drugs Not In Order with NextRefill <= MED_SYNC_DAYS.  That is handled in Live Inventory's OutOfStock.
//This function is for drugs that are In Order with NextRefill > MED_SYNC_DAYS, so that we can adject their quantities appropriately
//DON'T sync drugs NOT IN ORDER (ie early) because Guardians won't add the extra days to the old refill date, it will just set the refill date to today so they will just get extra medicine.  For example Drug 1 on Jan 1 for 90 days.  You DONT want to add Drug 2 to the Order even though its due on Feb and you can add it for only 60 days, altough qty wise this works (both Drug 1 & 2 should be due in April 1st) because Guardian will set fill date for Drug 2 as Jan 1 and refill date will still be set to Jan 1st + 60 days = March 1st.
//We ONLY want this on the firstfill of an Rx, otherwise we want to keep the quantities consistent


//SYNC to the date with the most drugs witth (30-120 days), not the date that is the furtest away. This is because CK said if 5 drugs in order and one drug due 30 days from now, rather than sync those 5 to 30 days, she would rather fill all those at 90 and then sync the next drug when it gets filled to 60 days
//In other words she only wants to sync when numDrugsBeingSynced < numDrugsSyncedTo
function getSyncDate(order) {

  var orderAdded = new Date(order.$OrderAdded)/1000/60/60/24

  var syncDates = { inOrder:0 }
  var syncDate  = []

  //Count how many drugs have each NextFill date
  for (var i in order.$Drugs) {

    var drug = order.$Drugs[i]

    //Only keep "MAY MEDSYNC" in order if there is at least one other script to be filled
    //Assuming drug order sorted by InOrder == true first
    if (drug.$Status == 'NOACTION_MAY_MEDSYNC' && ! syncDates.inOrder){
      drug.$Days = 0
      setDrugStatus(drug, 'NOACTION_NOT_DUE')
    }
    else if (drug.$Status == 'NOACTION_MAY_MEDSYNC' && syncDates.inOrder) {
      order.$Patient.medsync = true
      drug.$Name = drug.$Name.replace('*', '^')
      syncDates.inOrder++
    }
    else if (drug.$Status == 'NOACTION_WAS_MEDSYNC') {
      order.$Patient.medsync = true
      syncDates.inOrder++
    }
    else if (drug.$Days)
      syncDates.inOrder++

    var newDays = drug.$Days || drug.$DaysToRefill

    //$LastFill == "" means we have N/A for next_fill but still want to count it as a potential sync date. #11272 3 new surescipts were being synced to only 2 old sure scripts
    if (newDays >= 30 && newDays <= 120 && drug.$Autofill.rx) {
      var nextFill = roundDate(drug.$NextRefill, drug)
      syncDates[nextFill] = syncDates[nextFill] || 0
      syncDates[nextFill]++

      //Keep Track of the Most Common Date, if a tie chose the furthest out
      var moreCommon = syncDates[nextFill] > syncDate[1]
      var futherOut  = (syncDates[nextFill] == syncDate[1]) && nextFill > syncDate[0]
      if (moreCommon || futherOut) {
        syncDate[0] = nextFill
        syncDate[1] = syncDates[nextFill]
      }
    }
  }

  order.$Patient.syncDates = syncDates

  //Don't sync unless syncDate has more than current order
  if (syncDates.inOrder <= syncDate[1])
    order.$Patient.syncDate  = syncDate
}

function setSyncDays(order, drug) {

  if (drug.$IsDispensed || ! drug.$Days || ! order.$Patient.syncDate) return

  var newDays = (new Date(order.$Patient.syncDate[0]) - new Date(order.$OrderAdded))/1000/60/60/24

  newDays = Math.ceil((newDays-5)/15)*15   //Cindy wants us to round up to the nearest 15 days.  For rounding to 15, I don't want an equal Math.round() since I would want to error on giving people more than less but not quite just Math.ceil(), instead I do Math.ceil(x-5) because I want 66-80 -> 75, and 81-95 -> 90

  var daysLeftInRx = Math.round(drug.$WrittenQty * drug.$RefillsLeft * drug.$Days / drug.$Qty, 0)

  if (newDays > daysLeftInRx) return //debugEmail('Cannot Sync: not enough days left in the Rx', 'newDays', newDays, 'daysLeftInRx', daysLeftInRx, order)

  var oldDays  = drug.$Days
  drug.$Days   = newDays
  drug.$SyncBy = newDays - oldDays
  drug.$Price  = Math.round(drug.$Days * drug.$Price/oldDays)
  drug.$Qty    = Math.round(drug.$Days * drug.$Qty/oldDays)

  order.$Patient.medsync = true
  drug.$NextRefill = order.$Patient.syncDate[0]
  setDrugStatus(drug, 'NOACTION_MEDSYNC_TO_DATE')
}
