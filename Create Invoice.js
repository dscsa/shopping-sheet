//Hi
var getIf   = ' ?if *\\( *'
var getBody = ' *\\) *'
var getEnd  = '}'

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

function createInvoice(orderID) {
     
   var sheet = getSheet(null, 'A', 2) //allow to work for archived shopping sheets as well
   
   order = sheet.rowByKey(orderID) //default is active row
   order = flattenOrder(order) 
   
   //debugEmail('flatten order', orderID, order)
          
   if (order.$OrderId != +order.$OrderId)
     throw Error('Order Id does not appear to be valid')
     
   if ( ! order.$Fee) {
     var fee = order.$Drugs.reduce(function(sum, drug) { return sum+drug.$Price }, 0)
     debugEmail('createInvoice has no $Fee', '#'+order.$OrderId, order.$Fee, fee, order)
     order.$Fee = fee
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

//Flatten drug array into the data object by prepending index
function flattenOrder(order) {
 Log('order', order)
 for (var i in order.$Drugs) {   
   for (var j in order.$Drugs[i]) {
     order[i+j] = order.$Drugs[i][j] 
   }
   order[i+'$Msg'] = order[i+'$Msg'] || ''  //hack because Msg is not always set
 }
  
 return order
}

function interpolate(section, order) {
   
  if ( ! section) return
   
  expandTable(section, order)
  replaceVars(section, order)
  parseIfs(section)
}

function expandTable(section, vars) {
   var drugTable = section.getTables()[1]
   var numRows   = drugTable ? drugTable.getNumRows() : 1
   var copyRows  = []
   
   //Copy the table's current rows (skipping header) that will be copied for each drug
   //Prices that look like this $$Price become $0$0Price. It was too hard to fix this 
   //root issue with replaceText limitations so work around is to fix it in a 2nd call
   for (var i = 1; i<numRows; i++) {
     copyRows.push(drugTable.getRow(i).replaceText('\\$', '0$').replaceText('0\\$0\\$', '$0$'))
   } 
   
   var numDrugs = vars.$Drugs.length
   //Copy table's rows for each additional drug (the first set of rows already exists)
   for (var i = 0; i<numDrugs-1; i++) {
     for (var j in copyRows) {
       drugTable.appendTableRow(copyRows[j].copy().replaceText('0\\$', i+1+'$'))
     } 
   }
}

function replaceVars(section, order) {
  //Replace all variables starting with a "$" with the correct data.  Replacing undefined and null with 'NULL'
  //Replace most specific strings first: go backwards so that 12$ is replaced before 2$, if 2$ is replaced first then 12$ is no longer recognized (errors occurred when >10 drugs)
  Object.keys(order).reverse().forEach(function(key) {
    //blocks against an empty string key accidentally removing all of our $ prepends
    //escape the $ otherwise matches line-endings
    //Log('ReplaceVars', key, order[key])
    key && section.replaceText(key.replace('$', '\\$'), order[key] == null ? 'NULL' : order[key])
  })
}

//Table cells are elements that are divided by a \n(%0A) which replace/findText does not recognize.  
//These functions just look into each element separately so can find an "if {" in one cell that is ended by an "}" in another cell.
//Work around is to create our own mini parser.
function parseIfs(section) {
   
   var hasIf
      
   while ((hasIf = section.findText(getIf))) {
     
     
     var body  = section.findText(getBody, hasIf)
     var end   = section.findText(getEnd, body)
     
     if ( ! body || ! end) {
       Log('Error: if statement syntax is not complete')
       Log(hasIf.getText())
       Log(section.getText())
       break
     }
     
     var arg    = getIfArg(hasIf, body)  
     var last   = end.getElement()
     var start  = body.getElement()
     var middle = getPrevious(last)

     Log('if statement', start.getText(), arg)
     
     //Go backwards because replacing text and removing elements would change the offsets found going in forward direction.
     removeEnd(arg, last)
     
     if (start.getText() != last.getText()) {
       while (middle.getText() != start.getText())  {
         
         //Cache the next previous because if removeMiddle unattaches 
         //the element, it's predecessors will no longer be available
         var previous = getPrevious(middle)

         removeMiddle(arg, middle)
       
         if ( ! previous) {
           Log({title:'cannot find middle', startText:start.getText(), middleType:middle.getType(), middleText:middle.getText(), middleParentType:middle.getParent().getType(), middleParentText:middle.getParent().getText()})
           break
         }
      
         middle = previous
       }
     }

     removeStart(arg, start)
   }
  
   section.replaceText('}|{', '') //clean up.  Hack because nested ifs seem to leave last bracket if{if{ }} <-- this last one needs to get removed.  See comment above removeEnd
}

//Typical structure might be text > paragraph > table_cell
function getPrevious(elem) {
  return elem.getPreviousSibling() || elem.getParent().getPreviousSibling() || elem.getParent().getParent().getPreviousSibling()
}

//Below a "|" denotes a section break. * is the one to be remove
//if { if { | }}*
//if { | }* if { }
//if { if { | }}* if {}
//if { | if { }}* if {}  //this one we have to look for an even number of brackets which is hard.  
//For this last one, we would probably needs some count of open brackets in our while loop and 
//only remove end when openbreacks == 0 (or 1 if you include the if we are on).
function removeEnd(arg, elem) {

  Log('removeEnd', arg)

  if (arg) { //Only want to delete first occurence which isn't possible with replaceText
    replaceFirst(elem, '}')
  } else {   //Delete everything until last ending bracket without nesting. Replace text was replacing all text with ^[^}]*} and } if (Visa) { You Paid:$6 }.  I think it was running twice on this one element.
    replaceFirst(elem, '^[^{]*}')
  }
}

function removeMiddle(arg, elem) {
  if ( ! arg) {
    
    Log('removeMiddle', arg)
    
    replaceAll(elem, '.*')
  }
}

function removeStart(arg, elem) {
  
  var startIf = getIf+'.*?'+getBody+'{'
  
  Log('removeStart', arg)
  
  if (arg) { //Only want to delete last occurence which isn't possible with replaceText.  However any ifs before this one should have been replaced already so we should be okay.
    replaceFirst(elem, startIf) 
  } else {   //Delete everything until end (or first ending bracket)
    replaceFirst(elem, startIf+'[^}]*') 
  } 
}

function replaceAll(elem, regex) {
  
  var oldText = elem.getText()
  
  elem.replaceText(regex, '')
  
  var newText = elem.getText()
  
  if ( ! newText)
    removeEmptyTableRows(elem)
  
  Log('replaceAll', regex, oldText, ! newText ? '*REMOVED*' : newText)
}

function replaceFirst(elem, regex) {
    
  var rangeElem = elem.findText(regex)
  
  if ( ! rangeElem) return
    
  if (elem.asText)
    elem = elem.asText()
    
  var oldText = elem.getText()
  
  elem.deleteText(rangeElem.getStartOffset(), rangeElem.getEndOffsetInclusive())
  
  var newText = elem.getText()
  
  if (newText.length <= 1) //for some reason '}' was being left behind by deleteText()
    removeEmptyTableRows(elem)
  
  Log('replaceOnce', regex, 'oldText', !!oldText, oldText.length, oldText, 'newText', !!newText, newText.length, newText)
}

function getIfArg(hasIf, body) {
  
  var start = hasIf.getEndOffsetInclusive()+1
  var end = body.getStartOffset()
  var arg = hasIf.getElement().getText().slice(start, end)
 
  var arg2 = arg.replace(/ |null|undefined|0|false/gi, '')
  
  //Log('getIfArg', arg, arg2, ! /^(!.+)?$/.test(arg2))
  //falsey is either empty string or (! and not empty string)
  return ! /^( *!.+)?$/.test(arg2)
}    

//Don't understand this completely but it seems to work.  Before either the top portion would go missing
//or the table rows would remain.  Not sure if this generalizable to all elems but it seems to be working
function removeEmptyTableRows(parent) {
 
  var temp = parent
  
  //TABLE_ROW > TABLE_CELL > PARAGRAPH > TEXT
  while (parent && parent.getText().length <= 1) { //for some reason '}' was being left behind by deleteText()
    var elem = parent
    parent = elem.getParent()
  }
  
  try { //Parent (Table Row) may have already been removed by previous cell.
   
    if (parent.getType() == 'TABLE_ROW') {
      parent.removeFromParent()
      //Log('Removed Element:', parent && parent.getType(), parent && parent.getText(), parent && parent.getNumChildren && parent.getNumChildren())
    } else {
      elem.removeFromParent()
      Log('Not Removed Element:', parent && parent.getType(), elem && elem.getType(), temp && temp.getType())
    }
  } catch (e) {
    Log('Already Removed Element:', parent && parent.getType(), parent && parent.getText(), parent && parent.getNumChildren && parent.getNumChildren())
  }  
}

function openDialog(file) {
  var html = HtmlService.createHtmlOutputFromFile('Index')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
     SpreadsheetApp.getUi() // Or DocumentApp or FormApp.
      .showModalDialog(html, 'Dialog title');
}
