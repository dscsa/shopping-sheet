// TODO:
//Fix Tabs and Caps from Guardian


var LIVE_MODE = true  //set to false to turn off emails and text reminders.  Remember to turn it back on again!
var scriptId  = new Date() //A unique id per script run
var mainCache = CacheService.getScriptCache();

function mainLoop() {

  var sheet     = getSheet('Shopping', 'A', 2)
  var shipped   = getSheet('Shipped', 'A', 2)
  var report    = getReport('ShoppingSheet5.csv', sheet)

  var drugs     = sheet.colByKey('$Drugs')
  var tracking  = sheet.colByKey('$Tracking')
  var status    = sheet.colByKey('$Status')

  Log('Drug IDs', Object.keys(drugs))
  Log('Order IDs',Object.keys(report))
  for (var orderId in report) {

    var order = report[orderId]

    order.$RowChanged = scriptId

    setOrderStatus(order, status[orderId])

    Log('Order ID from Report', orderId, order.$Status)

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

  /* Hoisted Helper Functions that need access to the sheet and other local variables */

  function addOrder(order) {
    Log("Adding Order", order,  order.$OrderId, drugs[order.$OrderId], status[order.$OrderId])

    if (order.$Status == 'Shipped') return //Don't readd old order that may have been randomly updated e.g, 8850 on 02/07/2019

    addDrugDetails(order, 'addOrder')

    if (order.$Status == 'Shopping') //Must be called *AFTER* drug details are set
      order.$Status = createShoppingLists(order, order.$Drugs)

    order.$RowAdded = order.$RowChanged //Script Id

    //Use shopping sheet status to make sure we do not make calls when re-adding a row (does not catch one-item out of stock orders since no sheet is made in that case) so we check $Status as well
    /*if ( ~ order.$Status.indexOf('Re:') || order.$Status == 'Dispensed' || order.$Status == 'Shipped') { //Hyperlink() doesn't start with "Re:"
      infoEmail('Row likely readded because order is not yet in sheet but is already Shipped, Dispensed, or Shopped', order)
    }
    else */

    if ( ! order.$Pharmacy.short) { //Use Pharmacy name rather than $New to keep us from repinging folks if the row has been readded
      needsFormNotice(order)
    }
    else {
      if (order.$Status != 'Missing Rx') updateWebformReceived(order.$OrderId, order.$Patient.guardian_id, 'processing') //take it out of awaiting-rx or awaiting-transfer
      if (order.$Status != 'Dispensed' && order.$Status != 'Shipped') orderCreatedNotice(order)
      infoEmail('orderUpdatedNotice by addOrder', '#'+order.$OrderId, order.$Status, order)
    }

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
    }
  }

  function addTracking(order) {
     Log("Order Just Shipped", order.$OrderId, drugs[order.$OrderId], status[order.$OrderId], order)

     var invoice = getInvoice(order)

     if ( ! invoice) {
        if (order.$OrderShipped > order.$OrderChanged) debugEmail('Warning shipped order has no invoice!', invoice, order) //Otherwise this might be a refill request.  TODO: Change mssql query so that manual surescript refill requests don't show up
        return
     }

     //Don't change Drugs and Invoice since should already be finalized
     order.$Drugs = drugs[order.$OrderId]

     setPriceFeesDue(order)

     updateWebformShipped(order, invoice)

     deleteShoppingLists(order.$OrderId)

     orderShippedNotice(order, invoice)

     order.$Tracking = trackingFormula(order.$Tracking) //Wrap in hyperlinkformula

     try {
        shipped.updateRow(order)
     } catch (e) {
        shipped.prependRow(order)
     }

     sheet.updateRow(order)
  }

  function statusChanged(order) {

    Log('Status changed', '#'+order.$OrderId, status[order.$OrderId], order.$Status, order, drugs[order.$OrderId])
    infoEmail('Status changed', '#'+order.$OrderId, status[order.$OrderId],  order.$Status, order, drugs[order.$OrderId])

    var drugsChanged = didDrugsChange(order.$Drugs, drugs[order.$OrderId], order.$Status)

    //This is catching some "Dispensed" that are going back to "Shipping".  Need to investigate why.
    if (status[order.$OrderId] == 'Shipped' || status[order.$OrderId] == 'Dispensed') {
      debugEmail('Error, statusChanged() should not be called once dispensed or shipped',  status[order.$OrderId]+' -> '+order.$Status, drugsChanged, 'Current Order', order, 'Old Order', sheet.rowByKey(order.$OrderId))
    }

    //Since drugs were changed we need to add drug details back in
    addDrugDetails(order, 'statusChanged')// This call is expensive, avoid calling when possible

    if (drugsChanged)
      orderUpdatedNotice(order, drugsChanged)

    else if (status[order.$OrderId] == 'Needs Form') //Order 15402.  Needs form was never deleted when patient registered
      orderCreatedNotice(order)

    if (order.$Status == 'Shopping') //Must be called *AFTER* drug details are set
      order.$Status = createShoppingLists(order, order.$Drugs)

    sheet.updateRow(order)

    if (order.$Status == 'Dispensed') {

      orderDispensedNotice(order)

      //SEE HOW ACCURATE OUR PREDICTIONS WERE COMPARED TO WHAT WAS ACTUALLY DISPENSED
      infoEmail('Invoice Comparison', '#'+order.$OrderId, drugsChanged, 'New Drugs', order.$Drugs, 'Old Drugs', drugs[order.$OrderId], order)

      var invoice = createInvoice(order) //Pre-create invoice so Cindy doesn't always need to run it manually

      updateWebformDispensed(order, invoice) //Make sure webform is updated and has the exact amount as invoice (should match old fee[orderId] amount if $Days of each drug did not change)

      deleteShoppingLists(order.$OrderId)

      try {
        shipped.prependRow(order)
      } catch (e) {
        Log('shipped.prependRow failed trying an update instead', e)
        shipped.updateRow(order)
      }
    }
  }

  function drugsChanged(order) {

    var drugsChanged = didDrugsChange(order.$Drugs, drugs[order.$OrderId], order.$Status)

    if ( ! drugsChanged) return

    order.$Patient.changes = drugsChanged

    addDrugDetails(order, 'drugsChanged')  //this will prevent NULLs from appearing but is not necessary for functionality since when status updates details will get added then

    orderUpdatedNotice(order, drugsChanged)

    if (order.$Status == 'Shopping') //Must be called *AFTER* drug details are set
      order.$Status = createShoppingLists(order, order.$Drugs)

    sheet.updateRow(order)
  }
}

//Test for digits rather than truthy since less likely a bug will spam users this way
function isTrackingNumber(str, order) {
  var res = /\d{5,}/.test(str)
  if (str && ! res) debugEmail('isTrackingNumber is false', str, order)
  return res
}
