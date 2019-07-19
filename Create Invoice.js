function testGetInvoice() {
  var invoice = getInvoice({$OrderId:3722})
  Log(invoice.getUrl())
}

function getInvoice(order) {
  var sheet = getSheet('Shopping', 'A', 2)
  var invoiceId    = sheet.cellByKeys(order.$OrderId, '$InvoiceId')
  var orderChanged = sheet.cellByKeys(order.$OrderId, '$OrderChanged') //Since order.$OrderChanged might be raw date let get the formatted getDisplayValue() instead
  var invoiceName  = getInvoiceName(order.$OrderId, orderChanged)

  return getInvoiceById(invoiceId) ||
         getInvoiceByName(invoiceName) ||
         infoEmail('Cannot get invoice', 'invoiceId', '#'+invoiceId, 'invoiceName', invoiceName, 'orderChanged', orderChanged, order)
}

function getInvoiceById(invoiceID) {

  Log('getInvoiceById', invoiceID, !!invoiceID)
  try {
    if (invoiceID)
      return DriveApp.getFileById(invoiceID)
  } catch(e) {}
}

function getInvoiceByName(name) {

  var files = DriveApp.getFilesByName(name)

  Log('getInvoiceByName', name)

  if (files.hasNext()) {
    var file = files.next()
    Log('getInvoiceByName files.next()', name, file.getName(), file.getId())
    return file
  }
}

//Called by user manually from menu.  This is done when a manual correction is made
function updateInvoice() {

  var sheet = getSheet(null, 'A', 2)

  order = sheet.rowByKey() //When null, we should get active row. Get Order Ourselves because this is manually called by user and can't pass a parameter

  Log('Update Invoice Called', order)

  setPriceFeesDue(order)  //User may have changed $Days and $Prices so recalculate totals

  sheet.setCellByKeys(order.$OrderId, '$Total', order.$Total)
  sheet.setCellByKeys(order.$OrderId, '$Fee', order.$Fee)
  sheet.setCellByKeys(order.$OrderId, '$Due', order.$Due)

  createInvoice(order)

  SpreadsheetApp.flush() //Let's see these additions right away so user doesn't have to wait
}

function createInvoice(order) { //This is undefined when called from Menu

   var sheet = getSheet(null, 'A', 2) //allow to work for archived shopping sheets as well

   if (order.$OrderId != +order.$OrderId)
     throw Error('Order Id does not appear to be valid')

   if ( ! order.$Total || ! order.$Fee || order.$Due == null) { //$Due might be $0 so do null check instead
     Log('createInvoice has no $Total, $Fee, or $Due', '#'+order.$OrderId, order.$Total, order.$Fee, order.$Due, order)
     setPriceFeesDue(order)
   }

   order = flattenOrder(order)

   if ( ! LIVE_MODE) return debugEmail('createInvoice canceled because LIVE MODE OFF', order)

   Log('flatten order', order.$OrderId, order)

   var template  = fileByName("Order Summary v4")
   var invoice   = makeCopy(template, getInvoiceName(order.$OrderId, order.$OrderChanged), "Published")

   addInvoiceIdToRow(sheet, order.$OrderId, invoice)

   //We should be able to do replaceText on invoice but we use differing headers footers for the first page
   //which don't get picked up so we need to make our replacements on every https://issuetracker.google.com/issues/36763014
   var documentElement = invoice.getBody().getParent()
   var numChildren = documentElement.getNumChildren()

   for (var i = 0; i<numChildren; i++) {
     interpolate(documentElement.getChild(i), order)
   }

   invoice.saveAndClose()

   return invoice
}

function getInvoiceName(orderId, orderChanged) {
  return "Order Summary #"+orderId+" "+orderChanged
}

function addInvoiceIdToRow(sheet, orderId, invoice) {
  sheet.setCellByKeys(orderId, '$OrderId', '=HYPERLINK("'+invoice.getUrl()+'", "'+orderId+'")')
  sheet.setCellByKeys(orderId, '$InvoiceId', invoice.getId())
}
