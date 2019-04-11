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


//SYNC to the date with the most drugs witth (30-120 days), not the date that is the furtest away. This is because CK said if 5 drugs in order and one drug due 30 days from now, rather than sync those 5 to 30 days, she would rather fill all those at 90 and then sync the next drug when it gets filled to 60 days
//In other words she only wants to sync when numDrugsBeingSynced < numDrugsSyncedTo
function setOrderSync(order) {

  var orderAdded = new Date(order.$OrderAdded)/1000/60/60/24

  order.$Patient.syncDates = { inOrder:0, maySyncToOrder:0 }

  //Count how many drugs have each NextFill date
  for (var i in order.$Drugs) {

    var drug     = order.$Drugs[i]
    var nextFill = drug.$NextRefill
    var isDate   = nextFill.split('-').length == 3

    if (drug.$Days && ! drug.$InOrder) order.$Patient.syncDates.maySyncToOrder++
    if (drug.$Days &&   drug.$InOrder) order.$Patient.syncDates.inOrder++

    if ( ! isDate && ! drug.$Days) continue //$LastFill == "" means we have N/A for next_fill but still want to count it as a potential sync date. #11272 3 new surescipts were being synced to only 2 old sure scripts

    var newDays = isDate ? new Date(nextFill)/1000/60/60/24 - orderAdded : drug.$Days

    if (newDays >= 30 && newDays <= 120) {
      order.$Patient.syncDates[nextFill] = order.$Patient.syncDates[nextFill] || 0
      order.$Patient.syncDates[nextFill]++
    }
  }

  if (order.$Patient.syncDates.inOrder) //Only add sync refills that are not due yet if there are other drugs in the order #11274 had drugs synced to order but nothing otherwise in it
    order.$Patient.syncDates.inOrder += order.$Patient.syncDates.maySyncToOrder

  //Pick the date with most drugs (must be greater than num in current order), if tie chose the furthest out
  order.$Patient.syncDates.Best = Object.keys(order.$Patient.syncDates).reduce(function(bestDate, syncDate) {

    //Check for "N/A" because of #11360. Check for 'AutoRefill Off' because of #11420.
    if (syncDate == 'maySyncToOrder' || syncDate == 'N/A' || syncDate == 'AutoRefill Off') return bestDate

    if (order.$Patient.syncDates[syncDate] > order.$Patient.syncDates[bestDate]) return syncDate

    if (order.$Patient.syncDates[syncDate] == order.$Patient.syncDates[bestDate] && (syncDate > bestDate || bestDate == 'inOrder')) return syncDate

    return bestDate

  }, 'inOrder')

  //debugEmail('setOrderSync', order.$Patient.syncDates, order)
}

function setDrugSync(order, drug) {

  if (drug.$IsDispensed || ! drug.$Days) return

  if ( ! order.$Patient.syncDates.inOrder && drug.$Days && ! drug.$InOrder) {
    drug.$Days = 0
    drug.$Name = drug.$Name.replace('^', '*')
    drug.$Msg  = 'due on '+drug.$LastRefill
    return
  }

  if (order.$Patient.syncDates.Best == 'inOrder')
    return //debugEmail('Cannot Sync: Appears there is no best Sync Date', order.$Patient.syncDates, order)

  var orderAdded = new Date(order.$OrderAdded)/1000/60/60/24
  var newDays    = new Date(order.$Patient.syncDates.Best)/1000/60/60/24 - orderAdded
  newDays = Math.ceil((newDays-5)/15)*15   //Cindy wants us to round up to the nearest 15 days.  For rounding to 15, I don't want an equal Math.round() since I would want to error on giving people more than less but not quite just Math.ceil(), instead I do Math.ceil(x-5) because I want 66-80 -> 75, and 81-95 -> 90

  var daysLeftInRx = Math.round(drug.$WrittenQty * drug.$RefillsLeft * drug.$Days / drug.$Qty, 0)

  if (newDays > daysLeftInRx) return //debugEmail('Cannot Sync: not enough days left in the Rx', 'newDays', newDays, 'daysLeftInRx', daysLeftInRx, order)

  var oldDays  = drug.$Days
  drug.$Days   = newDays
  drug.$SyncBy = newDays - oldDays
  drug.$Msg    = (drug.$InOrder ? 'will be' : 'may be')+' Med Synced to '+order.$Patient.syncDates.Best+' *'
  drug.$Price  = Math.round(drug.$Days * drug.$Price/oldDays)
  drug.$Qty    = Math.round(drug.$Days * drug.$Qty/oldDays)
}
