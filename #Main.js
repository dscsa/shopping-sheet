var LIVE_MODE = false  //set to false to turn off emails and text reminders.  Remember to turn it back on again!
var mainCache = CacheService.getScriptCache();
var scriptId  = new Date() //A unique id per script run

// Use this code for Google Docs, Forms, or new Sheets.
function onOpen() {
  SpreadsheetApp.getUi() // Or DocumentApp or FormApp.
      .createMenu('Shopping')
      .addItem('Refresh Shopping Sheet', 'updateShopping')
      .addItem('Update Order Invoice', 'updateInvoice')
      .addItem('Transfer Out', 'createTransferFax')
      .addToUi();
}

function triggerShopping() {

  try {
    var start = new Date()
    if ( ! (start.getMinutes() % 3)) { //run every 3 minutes
      updateShopping(true)

      var lock = LockService.getScriptLock();

      if ( ! lock.tryLock(1000)) return

      var clinicPortal = SpreadsheetApp.getActiveSpreadsheet()
        .getSheetByName('Clinic Portal')
        .getRange('A3')
        .getDisplayValues()

      if ( ! clinicPortal[0] || ! clinicPortal[0][0])
        debugEmail('clinicPortal Error', clinicPortal)

      lock.releaseLock()
    }
  } catch (e) {
    //Log(e, e.message, e.stack)
    clearCacheLock()
    debugEmail('triggerShopping error', e, e.stack, mainCache)
  }
}

function clearCacheLock() {
  if (mainCache.remove) mainCache.remove('updateShoppingLock')
}

function updateShopping(email) {

  var lock = LockService.getScriptLock();

  console.log('updateShopping', scriptId)

  if ( ! lock.tryLock(1000)) {
    var err = 'Refresh Shopping Sheet is already running! '+scriptId.toJSON()
    console.log(err, scriptId)
    Logger.log(err)
    return
  }

  var updateShoppingLock = mainCache.get('updateShoppingLock')

  if (updateShoppingLock)
    return debugEmail('updateShoppingLock was set even though getScriptLock succeeded', 'Locked at:', updateShoppingLock, 'Failed at:', scriptId.toJSON())

  mainCache.put('updateShoppingLock', scriptId.toJSON(), 30*60)

  var sheet     = getSheet('Shopping', 'A', 2)
  var shipped   = getSheet('Shipped', 'A', 1)
  var report    = getReport('ShoppingSheet5.csv', sheet)

  var drugs     = sheet.colByKey('$Drugs')
  var tracking  = sheet.colByKey('$Tracking')
  var fee       = sheet.colByKey('$Fee') //cannot be auto-calculated. this is governed by an in sheet formula
  var status    = sheet.colByKey('$Status')

  Log('Drug IDs', Object.keys(drugs))
  Log('Order IDs',Object.keys(report))
  for (var orderId in report) {

    var order = report[orderId]

    order.$RowChanged = scriptId

    report[orderId].$Drugs.sort(sortDrugs)

    setStatus(order, status[orderId])

    Log('Order ID from Report', orderId, order.$Status)

    if (orderId == '11350' || orderId == '11349') {
       //debugEmail('Main DEBUG', order, isTrackingNumber(order.$Tracking, order), drugs[orderId] == null, tracking[orderId], didStatusChange(status[orderId], order.$Status))
    }

    if (tracking[orderId])
      Log("Don't do anything if there is already a tracking number", orderId, tracking[orderId], status[orderId])

    else if (drugs[orderId] == null) //This Order new to add a new order or re-add an order to a new shopping sheet.
      addOrder(order)

    else if (isTrackingNumber(order.$Tracking, order)) //Update an existing order that has been shipped?
      addTracking(order)

    else if (didStatusChange(status[orderId], order.$Status)) //Update an existing order with a status change
      statusChanged(order)

    else if (order.$Status != 'Dispensed') //Drug changed without a status change if before Dispensed (don't want it to overwrite our manual changes before we ship them)
      drugsChanged(order)
  }

  SpreadsheetApp.flush() //Recommended before releasing lock

  Log('Refresh Shopping Sheet Completed')

  mainCache.remove('updateShoppingLock')
  lock.releaseLock()

  /* Hoisted Helper Functions that need access to the sheet and other local variables */

  function addOrder(order) {
    Log("Adding Order", order,  order.$OrderId, drugs[order.$OrderId], status[order.$OrderId])

    if (order.$Status == 'Shipped') return //Don't readd old order that may have been randomly updated e.g, 8850 on 02/07/2019

    cancelFutureCalls(order, 'orderAdded '+status[order.$OrderId]+' -> '+order.$Status) //Added this 2019-01-24 because order #9817 did not delete the "New Patient" calls for order #9798 even though they were the same order (Cindy just deleted the first)

    addDrugDetails(order)

    if (order.$Status == 'Shopping') //Must be called *AFTER* drug details are set
      order.$Status = createShoppingLists(order, order.$Drugs)

    order.$RowAdded = order.$RowChanged //Script Id

    //Even though this section is a kind of $Status update but we separate it from other $Status updates because if we start a new sheet and re-add rows we don't want to duplicate patient emails/text/calls
    setNewRowCalls(order)

    order.$Tracking = trackingFormula(order.$Tracking)

    sheet.prependRow(order)

    Log('Order Added: Prepend Row')

    if (order.$Status != 'Dispensed')
      return createTransferFax(order.$OrderId)

    Log('Order Added: Is Dispensed')

    var invoice = getInvoice(order)

    if (invoice)
      addInvoiceIdToRow(sheet, order.$OrderId, invoice)
    else {
      debugEmail('Order readded but no invoice?',  status[order.$OrderId]+' -> '+order.$Status, order)
      //var invoice = createInvoice(order) //If Order is already correct we run the risk of replacing the old invoice attached to this order
      //updateWebformDispensed(order, invoice) //Orders 7042 & 7908 were incorrectly changed because of this call
    }
  }

  function addTracking(order) {
     Log("Order Just Shipped", order.$OrderId, drugs[order.$OrderId], status[order.$OrderId], order)

     var invoice = getInvoice(order)

     if ( ! invoice)
      return debugEmail('Warning shipped order has no invoice!', invoice, order)

     orderShippedNotification(order, invoice, drugs[order.$OrderId])

     updateWebformShipped(order, invoice)

     deleteShoppingLists(order.$OrderId)

     order.$Tracking = trackingFormula(order.$Tracking)

     try {
        shipped.updateRow(order)
     } catch (e) {
        shipped.prependRow(order)
     }

     //Drugs and Invoice should already be finalized
     delete order.$Drugs

     sheet.updateRow(order)

  }

  function statusChanged(order) {

    Log('Status changed', '#'+order.$OrderId, status[order.$OrderId], order.$Status, order, drugs[order.$OrderId])
    infoEmail('Status changed', '#'+order.$OrderId, status[order.$OrderId],  order.$Status, order, drugs[order.$OrderId])

    cancelFutureCalls(order, 'statusChanged '+status[order.$OrderId]+' -> '+order.$Status)

    var drugsChanged = didDrugsChange(order.$Drugs, drugs[order.$OrderId], order.$Status)

    //This is catching some "Dispensed" that are going back to "Shipping".  Need to investigate why.
    if (status[order.$OrderId] == 'Shipped' || status[order.$OrderId] == 'Dispensed') {
      debugEmail('Error, statusChanged() should not be called once dispensed or shipped',  status[order.$OrderId]+' -> '+order.$Status, drugsChanged, 'Current Order', order, 'Old Order', sheet.rowByKey(order.$OrderId))
    }

    //Skip updating drugs if their status is complete or they are unchanged
    if ( ! drugsChanged && status[order.$OrderId] != 'Needs Form') { //"Needs Form" will have all 0 days so need to make sure drugs update once registration complete

      order.$Drugs = drugs[order.$OrderId] //drug details are set on the old drugs but not the new ones

    } else {

      //Since drugs were changed we need to add drug details back in
      addDrugDetails(order)// This call is expensive, avoid calling when possible

      drugsChanged = JSON.stringify(drugsChanged, null, ' ') //hacky way for us to search for partial matches with indexOf (see below)

      //Don't renotify on small changes like QTY, DAYS, REFILLS.  Only when adding or subtracting drugs
      var numChanges  = drugsChanged && drugsChanged.split(/REMOVED FROM ORDER|ADDED TO ORDER|ADDED TO PROFILE AND ORDER/).length - 1
      if (numChanges) {
        rxReceivedNotification(order)
        debugEmail('rxReceivedNotification called because drugs & status both changed', '#'+order.$OrderId, status[order.$OrderId]+' --> '+order.$Status, drugsChanged, order)
      }

    }

    if (order.$Status == 'Shopping') //Must be called *AFTER* drug details are set
      order.$Status = createShoppingLists(order, order.$Drugs)

    sheet.updateRow(order)

    if (order.$Status == 'Dispensed') {

      //SEE HOW ACCURATE OUR PREDICTIONS WERE COMPARED TO WHAT WAS ACTUALLY DISPENSED
      infoEmail('Invoice Comparison', '#'+order.$OrderId, drugsChanged, 'New Drugs', order.$Drugs, 'Old Drugs', drugs[order.$OrderId], order)

      var invoice = createInvoice(order) //Pre-create invoice so Cindy doesn't always need to run it manually

      updateWebformDispensed(order, invoice) //Make sure webform is updated and has the exact amount as invoice (should match old fee[orderId] amount if $Days of each drug did not change)

      deleteShoppingLists(order.$OrderId)

      shipped.prependRow(order)
    }
  }

  function drugsChanged(order) {

    var drugsChanged = didDrugsChange(order.$Drugs, drugs[order.$OrderId], order.$Status)

    if ( ! drugsChanged) return

    addDrugDetails(order)  //this will prevent NULLs from appearing but is not necessary for functionality since when status updates details will get added then

    drugsChanged = JSON.stringify(drugsChanged, null, ' ')
    //Log('Drugs changed with no status change', order.$OrderId, drugsChanged, order)
    //infoEmail('Drugs changed with no status change', order.$OrderId, status[order.$OrderId],  order.$Status, order, $Drugs, drugs[order.$OrderId])
    var numChanges  = drugsChanged.split(/ADDED TO ORDER|ADDED TO PROFILE AND ORDER/).length - 1 //Did not include REMOVED FROM ORDER because Order #8781.  Because $InOrder drugs may have $Days set to 0 by Live Inventory.
    if (numChanges && order.$Status != "Needs Form") {
      infoEmail('rxReceivedNotification called because drugs changed', '#'+order.$OrderId, status[order.$OrderId]+' --> '+order.$Status, drugsChanged, 'Current Drugs', order.$Drugs, 'Old Drugs', drugs[order.$OrderId], 'Order', order)
      rxReceivedNotification(order, numChanges)
    }

    if (order.$Status == 'Shopping') //Must be called *AFTER* drug details are set
      order.$Status = createShoppingLists(order, order.$Drugs)

    sheet.updateRow(order)
  }
}

function setStatus(order, oldStatus) {
  if (order.$Tracking)
    order.$Status = 'Shipped'
  else if ( ! order.$Drugs.length)
    order.$Status = 'Missing Rx'
  else if (order.$OrderDispensed) //drug details might not be run so $Days could be NULL
    order.$Status = 'Dispensed'
  else if (order.$Drugs.reduce(function(dispensing, drug) { return dispensing || drug.$IsDispensed }, false)) //Solve reshopping for drugs that Cindy is about to dispense. This could also be solved by looking to see if the drug was automatically addded to order or whether Cindy added it herself
    order.$Status = 'Dispensing'
  else if ( ! order.$Pharmacy.short)
    order.$Status = 'Needs Form'
  else
    order.$Status = 'Shopping'
}

//Test for digits rather than truthy since less likely a bug will spam users this way
function isTrackingNumber(str, order) {
  var res = /\d{5,}/.test(str)
  if (str && ! res) debugEmail('isTrackingNumber is false', str, order)
  return res
}

////indexOf rather than != because of "Shopping List" vs "=HYPERLINK(url, 'Shopping List')".  Default to null since "" will be !true
function didStatusChange(oldStatus, newStatus) {

  if (newStatus == 'Shopping' && (oldStatus == 'Delayed' || oldStatus == 'Not Filling')) return false

  if (newStatus == 'Dispensing' && oldStatus == 'Shopping') return false //Don't trigger changes until we get to "Dispensed" otherwise we might send customer changes in batches

  return oldStatus && ! ~ oldStatus.indexOf(newStatus || null)
}

//While we could do this in group by order, this saves expensive lookups and
//calculations to be only for the orders that we are actually adding or updating
function addDrugDetails(order) {

  for (var i in order.$Drugs) {
    setV2info(order.$Drugs[i])
    Log(order.$OrderId, order.$Drugs[i].$Name, "setV2info")

    setDaysQtyRefills(order.$Drugs[i], order)
    Log(order.$OrderId, order.$Drugs[i].$Name, "setDaysQtyRefills")
  }

  setPriceFeesDue(order) //Must call this after $Day and $MonthlyPrice are set
  setOrderSync(order)

  for (var i in order.$Drugs) {
    setDrugSync(order, order.$Drugs[i])
    Log(order.$OrderId, order.$Drugs[i].$Name, "getSyncDays")
  }

  infoEmail('setDaysQtyRefills', order)
}
