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
  
  var emailJson = JSON.stringify(v2info, null, " ")
    
  if ( ! drug.$Stock && v2info['order.maxInventory'] & (v2info['inventory.qty'] < v2info['order.maxInventory']/2))
    sendEmail('Change Order for High stock Item', ['Consider updating v2 order for '+drug.$v2, drug.$v2+' ('+drug.$Name+') is high stock but its max inventory of '+v2info['order.maxInventory']+' is already way higher than its total quantity of '+v2info['inventory.qty']+' '+emailJson])
  else if ( ! drug.$Stock && v2info['inventory.qty'] > 1000 && (v2info['inventory.qty']/v2info['dispense.qty'] > 3) && (v2info['order.minQty'] < 5 || v2info['order.minDays'] < 150))
    sendEmail('Change Order for High stock Item', ['Consider updating v2 order for '+drug.$v2, drug.$v2+' ('+drug.$Name+') is high stock but is ordered even if it has a quantity > '+v2info['order.minQty']+' and expires more than '+v2info['order.minDays']+' days from now'+' '+emailJson])
  else if (drug.$Stock && drug.$Stock != 'Not Offered' && (v2info['inventory.qty'] > v2info['order.maxInventory'] - 100))
    sendEmail('Change Order for Low stock Item', ['Consider updating v2 order for '+drug.$v2, drug.$v2+' ('+drug.$Name+') is '+drug.$Stock+' but its max inventory of '+v2info['order.maxInventory']+' is too low given it already has a total quantity of '+v2info['inventory.qty']+' '+emailJson])
  else if (drug.$Stock && drug.$Stock != 'Not Offered' && (v2info['order.minQty'] > 1 || v2info['order.minDays'] > 90))
    sendEmail('Change Order for Low stock Item', ['Consider updating v2 order for '+drug.$v2, drug.$v2+' ('+drug.$Name+') is '+drug.$Stock+' but is ordered only if it has a quantity > '+v2info['order.minQty']+' and expires more than '+v2info['order.minDays']+' days from now'+' '+emailJson]) ///only send if max inventory is not the issue
}

function isNotInOrder(drug, order) {
  
  //Mirror the logic of when we are using useDispensed in SetDaysQtyRefills
  if (drug.$Type == 'Dispensed') return
  
  if ( ! drug.$InOrder && drug.$NextRefill == 'Transferred Out')
    return 'was transferred out on '+drug.$RxChanged.slice(0, 10)+' and can be filled at your backup pharmacy'
     
  if ( ~ ['No V2 stock'].indexOf(drug.$Stock)) 
    return 'is not currently offered and was transferred to your local pharmacy'
  
  if ( ! +drug.$Gcn) 
    return 'needs to be checked to determine if it is available'
    
  //Added because of Order #9554.  Meslamine was pended okay, but then a change of another drug, caused it to run again and this time the TotalQty was too low (because it had been pended) and gave patient a notification that it was too low to fill
  drug.$IsPended = !! openSpreadsheet('Shopping List #'+drug.$OrderId, 'Shopping Lists').getSheetByName(drug.$v2) //This should be cached so not too expensive
       
  //Should we allow apparent one time fills (refills_left == 0) as well?
  if ( ! drug.$IsPended && ! drug.$IsRefill && ~ ['Out of Stock', 'Refills Only', 'Not Offered'].indexOf(drug.$Stock)) {
    
       if ( ! drug.$Gcn) return 'appears to be out-of-stock but we are currently confirming'
       
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
    
  if (order.$Status == 'Needs Form')
    return 'cannot be filled until patient registration is complete'
    
  if ( ! drug.$Autofill.patient && drug.$AutoPopulated)
    return 'was requested but you have turned all medications off autorefill'
    
  if ( ! drug.$InOrder && drug.$NextRefill == 'N/A')
    return 'is past due.  Please request 2 weeks in advance'
    
  if (new Date(drug.$NextRefill) - new Date(order.$OrderAdded) > maxMedSyncTime(drug)) 
    return 'is due for a refill on '+drug.$NextRefill
    
  if ( ! drug.$IsPended && drug.$TotalQty < 2000 && drug.$Qty > 2.5*drug.$RepackQty) { 
    return 'was prescribed in an unusually high qty and needs to be reviewed by a pharmacist'
  }
  
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
   
    var sheet = getSheet('https://docs.google.com/spreadsheets/d/1gF7EUirJe4eTTJ59EQcAs1pWdmTm2dNHUAcrLjWQIpY/edit#gid=505223313', 'U', 1)
    
    var genericNames  = sheet.colByKey('key.2')
    
    if ( ! genericNames)
      throw new Error('Live Inventory Sheet Down.  Stopping Shopping Sheet!')
      
    var inventoryQtys = sheet.colByKey('inventory.qty')
    var dispensedQtys = sheet.colByKey('dispensed.qty')
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
          'dispensed.qty':dispensedQtys[gcns],
          'stock':stockLevels[gcns],
          'price / month':monthlyPrices[gcns],
          'order.minQty':minQtys[gcns],
          'order.minDays':minDays[gcns],
          'order.maxInventory':maxInventory[gcns]
        }
      }
    } 
    
    Log('liveInventoryByGcn 4', gcn, liveInventoryCache)
  }
  
  if (drug.$InOrder && +gcn && ! liveInventoryCache[gcn]) {
    sendEmail('Could not find GCN in v2', [gcn, JSON.stringify(drug), JSON.stringify(liveInventoryCache)])
  }

  return liveInventoryCache[gcn] || {}
}

/*
var v2drugs
var totalQtys
var stocks
var monthlyPrices
var minQtys
var minDays
var maxInventory

function getV2info(v2drug) {
  
  //Log('getV2info', v2drug)
  var sheet = getSheet('https://docs.google.com/spreadsheets/d/1gF7EUirJe4eTTJ59EQcAs1pWdmTm2dNHUAcrLjWQIpY/edit#gid=505223313', 'T', 1)
  
  //Get and cache all the remote columns we will need
  v2drugs = v2drugs || sheet.colByKey('key.2')
  totalQtys = totalQtys || sheet.colByKey('inventory.qty')
  stocks = stocks || sheet.colByKey('stock')
  monthlyPrices = monthlyPrices || sheet.colByKey('price / month')
  minQtys = minQtys || sheet.colByKey('order.minQty')
  minDays = minDays || sheet.colByKey('order.minDays')
  maxInventory = maxInventory || sheet.colByKey('order.maxInventory')
  
  return {
    'generic':v2drugs[v2drug],
    'inventory.qty':totalQtys[v2drug],
    'stock':stocks[v2drug],
    'price / month':monthlyPrices[v2drug],
    'order.minQty':minQtys[v2drug] || 5,
    'order.minDays':minDays[v2drug] || 150,
    'order.maxInventory':maxInventory[v2drug] || 2500
  }
}
*/