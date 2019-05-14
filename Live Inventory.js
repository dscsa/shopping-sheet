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
      drug.$Stock = 'Shopping Sheet Error'
      debugEmail('Shopping Sheet Error', drug, e2, e2.stack) //spreadsheet ui cannot be triggered from trigger
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
  if (v2info.stock == null) //This drug is not on Internal Inventory sheet (assume out of stock in this case)
    drug.$Stock = 'No V2 Stock'
  else
    drug.$Stock = v2info.stock || undefined //empty string means drug is in-stock so put undefined so it doesn't show up in drug json

  drug.$MonthlyPrice = +v2info['price / month']

  var emailBody = []

  var qtyThreshold = Math.ceil((+v2info['dispensed.qty']+5*v2info['qty threshold'])/1000)*1000 //qty threshold was too low for warning, want a little buffer.

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

function excludeFromOrder(drug, order) {

  //Mirror the logic of when we are using useDispensed in SetDaysQtyRefills
  if (drug.$Type == 'Dispensed') return

  if ( ! drug.$InOrder && drug.$NextRefill == 'Transferred Out')
    return 'was transferred out on '+drug.$RxChanged.slice(0, 10)+' and can be filled at your backup pharmacy'

  if ( ~ ['No V2 stock'].indexOf(drug.$Stock))
    return 'is not currently offered and was transferred to your local pharmacy'

  if ( ! +drug.$Gcn)
    return 'needs to be checked to determine if it is available'

  if (drug.$InOrder && ! drug.$v2)
    debugEmail('Could not find GCN in v2', drug, order)

  //Added because of Order #9554.  Meslamine was pended okay, but then a change of another drug, caused it to run again and this time the TotalQty was too low (because it had been pended) and gave patient a notification that it was too low to fill
  drug.$IsPended = !! openSpreadsheet('Shopping List #'+drug.$OrderId, 'Shopping Lists').getSheetByName(drug.$v2) //This should be cached so not too expensive

  //Should we allow apparent one time fills (refills_left == 0) as well?
  if ( ! drug.$IsPended && ! drug.$IsRefill && ~ ['Out of Stock', 'Refills Only', 'Not Offered'].indexOf(drug.$Stock)) {

       if (drug.$MonthlyPrice >= 20) return 'is unavailable for new RXs at this time'

       return 'is unavailable for new RXs and was transferred to your local pharmacy' //Should we allow apparent one time fills (refills_left == 0) as well?
  }

  //Testing this out
  if (drug.$NextRefill == 'Rx Expired') // Include this too???:  || ( ! drug.$InOrder && drug.$NextRefill == 'Rx Expiring')
    return 'has an expired Rx.  Please ask your doctor for a new Rx'

  if ( ! drug.$RefillsTotal)
    return 'is out of refills.  Please contact your doctor'

  if ( ! drug.$InOrder && drug.$NextRefill == 'AutoRefill Off')
    return 'has automatic refills turned off.  Please request 2 weeks in advance'

  if ( ! order.$Pharmacy) {//order.$Status == 'Needs Form' was messing up on #11121 since status showed as "Shopping" but this message still appeared
    //debugEmail('Patient needs to register email', '#'+drug.$OrderId, order.$Pharmacy, order.$Status, drug, order)
    return 'cannot be filled until patient registration is complete'
  }

  if ( ! drug.$Autofill.patient && drug.$AddedToOrderBy != "MANUAL" && drug.$AddedToOrderBy != "Webform")
    return 'was requested but you have turned all medications off autorefill'

  if ( ! drug.$InOrder && drug.$NextRefill == 'N/A')
    return 'is past due.  Please request 2 weeks in advance'

  if (new Date(order.$OrderAdded) - new Date(drug.$LastRefill) <= 10*24*60*60*1000)
    return 'was filled recently and not due again until '+drug.$NextRefill

  if (new Date(drug.$NextRefill) - new Date(order.$OrderAdded) > maxMedSyncTime(drug))
    return 'is due for a refill on '+drug.$NextRefill

  if (drug.$TotalQty < 2000 && drug.$Qty > drug.$DispenseQty && drug.$Qty > 2.5*drug.$RepackQty)
    return 'was prescribed in an unusually high qty and needs to be reviewed by a pharmacist'

  if (drug.$TotalQty < drug.$Qty && ! drug.$IsPended) {

     if (drug.$TotalQty >= 90) return 'is low in stock.  We will fill it as soon as we can.' //want it past tense on order invoice, but present tense and looser for refill reminder emails.

     if (drug.$MonthlyPrice >= 20) return  'is out of stock.  We will fill it as soon as we can.' //Cindy not always transferring out branded medication right now so don't say that

     return 'is out of stock right now and will be transferred out to your local pharmacy'
  }

  //#4636 Webform Transfer Created Empty Order And Did Not Include Drugs From Profile
  //#4618 An Auto Refill Appeared That Didn't Include A Drug That Had A Refill Date Of 2 Months Ago (why didn't we refill it then?)
  //#4607 Query Mistake?  IsRefill is true but no LastRefill
  //#4598 Scripts were written and sent on 12/17 but not filled right away.  So today on 5/25 we assume there was a reason we didn't send them
  //Put in Date comparison so that meds that should be medsynced are shopped for EVEN if they are not in the order
  if (new Date(drug.$NextRefill) - new Date(order.$OrderAdded) < - minMedSyncTime(drug)) {
    drug.$Type = 'Excluded' //Overwrite the dispensed/estimated/etc
    infoEmail('was not included in your order BUT could be?', '#'+drug.$OrderId, '$Msg', drug.$Msg, drug)
    return drug.$Msg || 'is available upon request' //Might be a unexpired script with refills that we haven't filled in a long time.
  }
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
          'order.maxInventory':maxInventory[gcns]
        }
      }
    }

    //debugEmail('liveInventoryByGcn 4', gcn, genericNames, liveInventoryCache)
  }

  return liveInventoryCache[gcn] || {}
}
