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

function createInvoice(orderID) { //This is undefined when called from Menu

   var sheet = getSheet(null, 'A', 2) //allow to work for archived shopping sheets as well

   order = sheet.rowByKey(orderID) //Defaults to getting active row if OrderID is undefined
   order = flattenOrder(order)

   //debugEmail('flatten order', orderID, order)

   if (order.$OrderId != +order.$OrderId)
     throw Error('Order Id does not appear to be valid')

   if ( ! order.$Total) {
     order.$Total = order.$Drugs.reduce(function(sum, drug) { return sum+drug.$Price }, 0)
     debugEmail('createInvoice has no $Total', '#'+order.$OrderId, order.$Total, order)
   }

   if ( ! order.$Fee) {
     order.$Fee = order.$IsNew ? 6 : order.$Total
     debugEmail('createInvoice has no $Fee', '#'+order.$OrderId, order.$Fee, order)
   }

   if (order.$Due == null) { //$Due might be $0 so do null check instead

     order.$Due = order.$Fee

     if (order.$Card) order.$Due = 0
     else if (order.$Coupon && order.$Coupon.slice(0, 6) != "track_") order.$Due = 0

     debugEmail('createInvoice has no $Due', '#'+order.$OrderId, order.$Due, order)
   }

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

   return {invoice:invoice, fee:order.$Fee}
}

function getInvoiceName(orderId, orderChanged) {
  return "Order Summary #"+orderId+" "+orderChanged
}

function addInvoiceIdToRow(sheet, orderId, invoice) {
  sheet.setCellByKeys(orderId, '$OrderId', '=HYPERLINK("'+invoice.getUrl()+'", "'+orderId+'")')
  sheet.setCellByKeys(orderId, '$InvoiceId', invoice.getId())
}
