//Used within spreasheet's forumalas to extract and manipulate drug data because gsheet's doesn't have built-in JSON ability and using RegEx is hard.
function sumProperty(rows, prop) {

  Utilities.sleep(Math.random()*1000)

  try {
    return pickProperty(rows, prop).map(function(row) {
      return row.length ? row.reduce(function(sum, val) {
        return sum + (+val || 0)
      }, 0) : ''
    })
  } catch (e) {
    //Log(e, e.message, e.stack)
    debugEmail('sumProperty error', e, e.stack, rows, prop)
  }
}

//Used within spreasheet's forumalas to extract and manipulate drug data because gsheet's doesn't have built-in JSON ability and using RegEx is hard.
function pickProperty(rows, prop) {
  //Utilities.sleep(Math.random()*1000)
  var start = new Date()
  try {
    return rows.map(function(row) {
        return _pickProperty(row[0], prop)
    })
  } catch (e) {
    //Log(e, e.message, e.stack)
    debugEmail('pickProperty error', e, e.stack, rows, prop)
  }
}

function _pickProperty(json, prop) {
  //console.log('pickProperty', typeof json, json, prop)

  if ( ! json || json == '[]' || json[0] != '[' || json.slice(-1) != ']') return []
  //Handwritten decimals (corrected refill amounts) may not have required leading 0 so add it here to avoid JSON syntax error
  var arr = JSONparse(json)

  //If exclude drug in order by zeroing out the days, then the price should reflect that
  return arr.map(function(row) { return prop == '$Price' && row.$Days == 0 ? 0 : row[prop] || '' })
}
