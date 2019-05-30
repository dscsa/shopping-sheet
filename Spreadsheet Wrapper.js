var getSheetCache = {} //reduced shopping update of 5 orders of 18 drugs from 23 secs down to 7secs if no changes and down to 10secs if adding all

function getSheet(sheetNameOrUrl, colOfKeys, rowOfKeys) {

  sheetNameOrUrl = sheetNameOrUrl || SpreadsheetApp.getActiveSheet().getName() || 'Shopping'

  var cacheKey = sheetNameOrUrl+colOfKeys+rowOfKeys
  if (getSheetCache[cacheKey]) return getSheetCache[cacheKey]

  Log('getSheet', sheetNameOrUrl, colOfKeys, rowOfKeys)

  var sheet = getSheetByNameOrUrl(sheetNameOrUrl)

  var s = {}
  for (var method in sheet) {
    s[method] = sheet[method].bind(sheet)
  }

  rowOfKeys = rowOfKeys || 1
  colOfKeys = colOfKeys || 'A'

  s.getRangeVals = function(range) {
    //Log('getRangeVals')
    /*
    TODO write a range cache that can be spliced (or at least invalidated) after sheet.prependRow()
    var cacheKey = sheetNameOrUrl+range
    Log('getRangeVals cacheKey', cacheKey)
    if (getSheetCache[cacheKey]) {
      Log('cached :)')
      return getSheetCache[cacheKey]
    }
    Log('not cached :(')
    return getSheetCache[cacheKey] = s.getRange(range).getDisplayValues()
    */
    try {
      return s.getRange(range).getDisplayValues()
    } catch (e) {
      //debugEmail('getRangeVals', range, e) //this happens if key didn't exist (such as a drug name that is not in Good Pill Live Inventory)
      //return [[]]
    }
  }

  s.colArrayByRange = function(range) {
    //Log('colArrayByRange')
    range = s.getRangeVals(range) || []
    return range.map(function(row) { return row[0] })
  }

  s.rowArrayByRange = function(range) {
    //Log('rowArrayByRange')
    range = s.getRangeVals(range) || []
    return range[0]
  }

  s.getKeyID = function() {
    var range = colOfKeys+rowOfKeys
    var keyID = s.getRangeVals(range)[0][0]
    if (keyID) return keyID
    Utilities.sleep(3000)
    return s.getRangeVals(range)[0][0]
  }

  s.getColKeys = function() {
    var range = 'A'+rowOfKeys+':'+rowOfKeys

    var colKeys = s.rowArrayByRange(range)
    if (colKeys[0]) return colKeys

    debugEmail('WARNING! 1st getColKeys failed', range, colKeys)

    Utilities.sleep(3000)

    colKeys = s.rowArrayByRange(range)
    if (colKeys[0]) return colKeys

    debugEmail('WARNING! 2nd getColKeys failed', range, colKeys)

    return colKeys
  }

  s.getRowKeys = function() {
    var range = colOfKeys+'1:'+colOfKeys
    var rowKeys = s.colArrayByRange(range)
    if (rowKeys[0]) return rowKeys
    Utilities.sleep(3000)
    return s.colArrayByRange(range)
  }

  var keyID   = s.getKeyID()
  var colKeys = s.getColKeys()
  var rowKeys = s.getRowKeys()

  //While we try to make keys unique, we cannot guarantee it
  s.rowNumberByKey = function(key) {
    //Log('rowNumberByKey')
    if ( ! key) return s.getActiveRange().getRow()

    var first = rowKeys.indexOf(key+'')
    var last  = rowKeys.lastIndexOf(key+'')  //coerce to string to match type

    if (first != last) {
      debugEmail('WARNING! Duplicate Rows', key, first, last, rowKeys)
      throw new Error('WARNING! Duplicate Rows for rowNumberByKey('+key+')')
    }

    //Replace indexOf with lastIndexOf.  Both should work but since new orders are being prepended to top of sheet, in the case of an error,
    //the top order (newer order) was being returned which then needed to be updated.  Its better to keep returning the last (oldest) order
    //so that we don't have to keep updating newer orders
    return last + 1
  }

  //https://stackoverflow.com/questions/21229180/convert-column-index-into-corresponding-column-letter
  s.colNumberByKey = function(key) {
    //Log('colNumberByKey')
    if ( ! key) return s.getActiveRange().getColumn()

    //Replace indexOf with lastIndexOf.  Both should work but wanted to keep in sync with change on rowNumberByKey()
    var first = colKeys.indexOf(key+'')
    var last  = colKeys.lastIndexOf(key+'')  //coerce to string to match type

    if (first != last) {
      debugEmail('WARNING! Duplicate Columns', key, first, last, colKeys)
    }

    if (colKeys[0] && last < 0) { //Somethimes colKeys[0] is emptry string because sheet is refreshing
      var msg = 'Could not find column number for key '+JSON.stringify(key)+' in '+JSON.stringify(colKeys)
      Log(msg)
      throw Error(msg)
    }

    return last + 1
  }

   //https://stackoverflow.com/questions/21229180/convert-column-index-into-corresponding-column-letter
  s.colLetterByKey = function(key) {
    var num  = s.colNumberByKey(key) - 1 //make it a 0-based Alphabet index
    var col1 = num % 26
    var col2 = Math.floor(num / 26) //double letter past Z
    //debugEmail('num', num, 'key', key, 'col2', col2, (col2 ? String.fromCharCode(64 + col2) : ''), 'col1', col1, String.fromCharCode(65 + col1))
    return (col2 ? String.fromCharCode(64 + col2) : '')+String.fromCharCode(65 + col1)
  }

  s.colRangeByKey = function(key) {
    //Log('colRangeByKey')
    var colLetter = s.colLetterByKey(key)
    //Log('nameRange', name, nameArray, colLetter+"4:"+colLetter)
    return colLetter+"1:"+colLetter
  }

  s.rowRangeByKey = function(key) {
    //Log('rowRangeByKey')
    var rowNumber = s.rowNumberByKey(key)
    return 'A'+rowNumber+":"+rowNumber
  }

  s.cellRangeByKeys = function(rowKey, colKey) {
    //Log('cellRangeByKeys')
    return s.colLetterByKey(colKey)+s.rowNumberByKey(rowKey)
  }

  var colCache = {}
  var rowCache = {}

  s.colArrayByKey = function(key) {

    //TODO should we implement real caching here? Doesn't seem like a lot of redundant calls?
    //TODO: compared to cache, properties are faster and don't expire. https://stackoverflow.com/questions/20398885/how-to-flush-the-cache
    //https://developers.google.com/apps-script/reference/properties/properties#setProperty(String,String)
    if (colCache[sheetNameOrUrl+key])
      Log('colCache', key, sheetNameOrUrl)

    colCache[sheetNameOrUrl+key] = true

    try {
      var range = s.colRangeByKey(key)
      return s.colArrayByRange(range)
    } catch (e) {
      debugEmail(key, range, e)
    }
  }

  s.rowArrayByKey = function(key) {

    //TODO should we implement real caching here? Doesn't seem like a lot of redundant calls?
    //TODO: compared to cache, properties are faster and don't expire. https://stackoverflow.com/questions/20398885/how-to-flush-the-cache
    //https://developers.google.com/apps-script/reference/properties/properties#setProperty(String,String)
    if (rowCache[sheetNameOrUrl+key])
      Log('rowCache', key, sheetNameOrUrl)

    rowCache[sheetNameOrUrl+key] = true

    //Log('rowArrayByKey', key, s.rowRangeByKey(key), s.rowArrayByRange(s.rowRangeByKey(key)))
    return s.rowArrayByRange(s.rowRangeByKey(key))
  }

  //Returns a col as an object including JSON.parsing properties that are arrays or objects
  s.colByKey = function(key) {
    //Log('colByKey')
    return toObject(rowKeys, s.colArrayByKey(key))
  }

  //Returns a row as an object including JSON.parsing properties that are arrays or objects
  s.rowByKey = function(key) {
    //Log('rowByKey', colKeys, s.rowArrayByKey(key))
    return toObject(colKeys, s.rowArrayByKey(key))
  }

  s.cellByKeys = function(rowKey, colKey) {
    //Log('cellByKey')
    return s.getRangeVals(s.cellRangeByKeys(rowKey, colKey))[0][0]
  }

  s.setCellByKeys = function(rowKey, colKey, val) {
    //Log('setCellByKeys')
    var range = s.cellRangeByKeys(rowKey, colKey)

    try {
      var rangeVals = s.getRange(range)
    } catch(e) {
      throw new Error('Cannot get range '+sheetNameOrUrl+'!'+range)
    }
    return setValue(rangeVals, val)
  }

  //Private Helper
  /*function setValueOLD(cellRange, val) {
    val = prettyJSON(val)
    return cellRange[val[0] == '=' ? 'setFormula' : 'setValue'](val)
  }*/

  function setValue(cellRange, val) {
    val = prettyJSON(val)
    var method = 'setValue'
    var value  = val

    if (val[0] == '=') {
      method = 'setFormula'
      value = replaceColumnVars(val, cellRange)
      //debugEmail('setFormula',val, value, cellRange.getColumn(), cellRange.getRow(), cellRange.getLastRow())
    }

    if (value.length >= 50000) {
      debugEmail('Error: cell length cannot be over 50,0000', value)
      value = value.slice(0, 50000)
    }

    return cellRange[method](value)
  }

  function replaceColumnVars(formula, cellRange) {
    return formula.replace(/(^|[^"'])(\$[a-zA-Z]+)(\d*)/g, function(full, pre, key, row) {
      //Log('newFormula', full, key, row)
      var col = s.colLetterByKey(key)
      return pre + col+cellRange.getRow()+':'+col+cellRange.getLastRow() //if no row set assume this is for a newly prepended row
    })
  }

  s.updateCol = function(newCol) {
    //Log('setColByKey')
    //
    //While simple, the following is slow because of lots of getRange() calls
    //for (var rowKey in data) {
    // s.setCellByKeys(rowKey, colKey, data[rowKey])
    //}

    var oldCol = s.getRange(s.colRangeByKey(newCol[keyID]))

    for (var rowKey in newCol) {
      setValue(oldRow.getCell(s.rowNumberByKey(rowKey), 1), newCol[rowKey])
    }
  }

  s.updateRow = function(newRow, overwrite) {
    //Log('setRowByKey')
    //
    //While simple, the following is slow because of lots of getRange() calls
    //for (var colKey in data) {
    // s.setCellByKeys(rowKey, colKey, data[colKey])
    //}
    //Swapping this with code below reduced "per row" exec time from 4 secs to .5 secs.

    if (rowKeys.indexOf(newRow[keyID]) != rowKeys.lastIndexOf(newRow[keyID])) {
      throw new Error('Error: updateRow.  Cannot update row with duplicate key '+JSON.stringify(newRow, null, " "))
    }

    var range = s.rowRangeByKey(newRow[keyID])

    try {
      var oldRow = s.getRange(range)
    } catch (e) {
      //debugEmail('s.updateRow getRange() FAILED', range, keyID, newRow, e) //This will fail with range A0:0 when an RowKey (e.g Order #) is not found
      throw e
    }

    for (var colKey in newRow) {

      var val = newRow[colKey]

      var isFormula = typeof val == 'string' && val[0] == '='

      if (colKey == keyID && ! overwrite) //don't reset keyID just in case its a hyperlink.  dont reset formulas just in case user changed them or did a hardcode overwrite
        continue

      setValue(oldRow.getCell(1, s.colNumberByKey(colKey)), val)
    }

    SpreadsheetApp.flush() //Attempt to keep an old script that has not written changes getting ov
  }

  s.prependRow = function(row) {

    if ( ~ rowKeys.indexOf(row[keyID])) {
      throw new Error('Error: prependRow.  Cannot update row with duplicate key '+JSON.stringify(row, null, " "))
    }

    s.insertRowAfter(rowOfKeys)
    rowKeys.splice(rowOfKeys, 0, row[keyID]) //add the new row to rowKeys
    SpreadsheetApp.flush() //Let's make sure the row is added before we update
    s.updateRow(row, true)
  }

  return getSheetCache[cacheKey] = s
}

//Combine key and val arrays into an object.  If value is JSON then parse it.  Trim both keys and vals (helpful for MSSQL reports)
function toObject(keys, vals) {

  //Log('toObject')
  //Log(keys.length, vals.length, keys, vals)
  var row = {}

  //Log('keys', keys, 'vals', vals)
  for (var i in keys) {
    if ( ! keys[i]) continue

    if (vals[i] && (vals[i][0] == '[' || vals[i][0] == '{'))
        vals[i] = JSONparse(vals[i])
    else if (vals[i].trim)
      vals[i] = vals[i].trim()

    var key = keys[i].trim()
    row[key] = vals[i] //this will override value in the (rare/error) case keys are NOT unique.  This is okay because lastIndexOf() is used by rowNumberByKey().
  }

  return row
}

//JSON the drugs but allow for good readability without too much vertical space
//Right now do this by doing pretty print JSON and then removing linebreaks after commas
var regex = RegExp(String.fromCharCode(10)+'(?! *{)', 'g')
function prettyJSON(val) {

  //Log('prettyJSON')

  if (val == null)
    return ''

  if (typeof val == 'string' || val instanceof Date)
    return val

  return JSON.stringify(val, null, " ").replace(regex, '')
}

function getSheetByNameOrUrl(sheetNameOrUrl) {

  if ( ! ~ sheetNameOrUrl.indexOf('//'))
    return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetNameOrUrl)

  //Unfortunetely GAS doesn't have a getSheetById() method so we have to iterate to find the right one
  var sheets = SpreadsheetApp.openByUrl(sheetNameOrUrl).getSheets()

  for (var i in sheets)
    if (sheets[i].getSheetId() == sheetNameOrUrl.split('=')[1]) break

  return sheets[i]
}
