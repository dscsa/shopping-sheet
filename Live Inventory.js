function setV2info(drug) {
  //Determines which price point to use, and does any necessary prorating
  //Use 30 day price if available, otherwise use 90 day price.  Prorate using days supply
  if ( ! drug.$Gcn) {
    debugEmail('Gcn Error', drug) //spreadsheet ui cannot be triggered from trigger
    return //should al
  }

  try {
    _setV2info(drug)
  } catch (e1) {
    Utilities.sleep(10000) //Live Inventory Sheet might be refreshing so retry once
    try {
      _setV2info(drug)
      infoEmail('setV2info error but sleeping for 10 seconds seemed to fix it', drug, e1, e1.stack)
    } catch (e2) {
      debugEmail('setV2info ERROR', drug, e2, e2.stack) //spreadsheet ui cannot be triggered from trigger
      throw e2
    }
  }
}

function _setV2info(drug) {

  var v2info = liveInventoryByGcn(drug)

  //Log('v2info', v2info)
  if ( ! v2info['generic'])
    return drug.$Stock = +drug.$Gcn ? 'Not Offered' : 'No GCN'

  drug.$v2        = v2info['generic']
  drug.$TotalQty  = +v2info['inventory.qty'] || 0 //drug.$AvailableQty = +v2info['Available Qty'] || 0
  drug.$RepackQty = +v2info['order.repackQty'] || 135
  drug.$Stock = v2info.stock || undefined //empty string means drug is in-stock so put undefined so it doesn't show up in drug json

  drug.$MonthlyPrice = +v2info['price / month']

  var emailBody = []

  var qtyThreshold = Math.ceil((+v2info['dispensed.qty']+5*v2info['qty threshold'])/2500)*2500 //qty threshold was too low for warning, want a little buffer.

  if ( ! drug.$Stock && v2info['order.maxInventory'] && (v2info['order.maxInventory'] > 3500) && (v2info["price / month"] < 20) && (+v2info['order.maxInventory'] > qtyThreshold))
    emailBody.push(['Consider decreasing v2 max inventory for '+drug.$v2+' to '+qtyThreshold, drug.$v2+' ('+drug.$Name+') '+v2info['order.maxInventory']+' > '+v2info['dispensed.qty']+' + 5*'+v2info['qty threshold']])
  else if ( ! drug.$Stock && (v2info['inventory.qty'] > 1000) && (v2info["price / month"] < 20) && (+v2info['inventory.qty'] > qtyThreshold) && (v2info['order.minQty'] < 5 || v2info['order.minDays'] < 150))
    emailBody.push(['Consider increasing v2 minDays & minQty for '+drug.$v2, drug.$v2+' ('+drug.$Name+') '+v2info['inventory.qty']+' > '+v2info['dispensed.qty']+' + 5*'+v2info['qty threshold']])
  else if (drug.$Stock && drug.$Stock != 'Not Offered' && (v2info['inventory.qty'] > v2info['order.maxInventory'] - 100))
    emailBody.push(['Consider increasing v2 max inventory for '+drug.$v2, drug.$v2+' ('+drug.$Name+') is '+drug.$Stock+' but its max inventory of '+v2info['order.maxInventory']+' is too low given it already has a total quantity of '+v2info['inventory.qty']])
  else if (drug.$Stock && drug.$Stock != 'Not Offered' && (v2info['order.minQty'] > 1 || v2info['order.minDays'] > 90))
    emailBody.push(['Consider updating v2 order for '+drug.$v2, drug.$v2+' ('+drug.$Name+') is '+drug.$Stock+' but is ordered only if it has a quantity > '+v2info['order.minQty']+' and expires more than '+v2info['order.minDays']+' days from now']) ///only send if max inventory is not the issue

  if (emailBody.length && drug.$IsDispensed)
    debugEmail('Consider updating v2 Drug Orders', emailBody, v2info)
}

var liveInventoryCache = {}
function liveInventoryByGcn(drug) {

  var gcn = drug.$Gcn
  //Create a map function for each GCN
  if ( ! Object.keys(liveInventoryCache).length) {

    //IF ROWS ARE ADDED TO THE SHEET THE COLUMN WITH GCNS e.g. "U" MUST BE UPDATED.
    var sheet = getSheet('https://docs.google.com/spreadsheets/d/1gF7EUirJe4eTTJ59EQcAs1pWdmTm2dNHUAcrLjWQIpY/edit#gid=505223313', 'U', 1)

    var genericNames  = sheet.colByKey('key.2')

    if ( ! genericNames)
      throw new Error('Live Inventory Sheet Down.  Stopping Shopping Sheet!')

    var inventoryQtys = sheet.colByKey('inventory.qty')
    var dispensedQtys = sheet.colByKey('dispensed.qty')
    var enteredQtys   = sheet.colByKey('entered.qty')
    var qtyThreshold  = sheet.colByKey('qty threshold')
    var stockLevels   = sheet.colByKey('stock')
    var monthlyPrices = sheet.colByKey('price / month')
    var minQtys       = sheet.colByKey('order.minQty')
    var minDays       = sheet.colByKey('order.minDays')
    var maxInventory  = sheet.colByKey('order.maxInventory')
    var repackQty     = sheet.colByKey('order.repackQty')

    for (var gcns in genericNames) {
      gcns = gcns.split(',')
      for (var i in gcns) {
        liveInventoryCache[gcns[i]] = {
          'generic':genericNames[gcns],
          'inventory.qty':inventoryQtys[gcns],
          'entered.qty':enteredQtys[gcns],
          'dispensed.qty':dispensedQtys[gcns],
          'qty threshold':qtyThreshold[gcns],
          'stock':stockLevels[gcns],
          'price / month':monthlyPrices[gcns],
          'order.minQty':minQtys[gcns],
          'order.minDays':minDays[gcns],
          'order.maxInventory':maxInventory[gcns],
          'order.repackQty':repackQty[gcns]
        }
      }
    }
  }

  if (drug.$IsRefill && +gcn && ( ! liveInventoryCache[gcn] || liveInventoryCache[gcn].stock == 'Not Offered')) {
    debugEmail('Error: Refill Rx has "Not Offered" Stock', gcn, drug, liveInventoryCache[gcn], 'cache length', Object.keys(liveInventoryCache).length, 'genericNames', genericNames, 'inventoryQtys', inventoryQtys, 'enteredQtys', enteredQtys, 'dispensedQtys', dispensedQtys, liveInventoryCache)
  }

  return liveInventoryCache[gcn] || {}
}
