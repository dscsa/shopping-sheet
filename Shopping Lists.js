function testShoppingLists() {
  return createShoppingLists(9999, [
    //{$v2:'Risperidone 0.5mg',   $Days:30, $Qty:90},
    //{$v2:'Divalproex 125mg Dr', $Days:30, $Qty:30},
    //{$v2:'Atorvastation 20mg',   $Days:90, $Qty:180},
    //{$v2:'Cyclobenzaprine 10mg', $Name:'Cyclobenzaprine 10mg', $Days:90, $Qty:90},
      {$v2:'Fluoxetine 20mg', $Name:'FLUOXETINE HCL 20 MG CAPSULE', $Days:90, $Qty:90}
  ])
}

//So Cindy doesn't have to unpend things that didn't ship
function deleteShoppingLists(orderID) {
  var res = v2Fetch('http://v2.goodpill.org/account/8889875187/pend/'+orderID, 'DELETE')

  var shoppingListFolder   = DriveApp.getFolderById('1PcDYKM_Ky-9zWmCNuBnTka3uCKjU3A0q')
  var shoppingListIterator = shoppingListFolder.getFilesByName('Shopping List #'+orderID)
  var hasNext              = shoppingListIterator.hasNext()

  if (hasNext)
    shoppingListIterator.next().setTrashed(true) //Prevent printing an old list that Cindy pended and shipped on her own

  infoEmail('deleteShoppingLists', orderID, 'hasNext', hasNext, res && res.getContentText(), res && res.getResponseCode(), res && res.getHeaders())
}

function createShoppingLists(order, drugs) {

  var orderID = order.$OrderId

  infoEmail('createShoppingLists', order, new Error().stack) //debug v2 shopping for meds after they are already dispensed

  var ss   = openSpreadsheet('Shopping List #'+orderID, 'Shopping Lists')
  var errs = []
  for (var i in drugs) {
    try {
      createShoppingList(drugs[i], order)
    } catch (err) {
      errs.push(err)
    }
  }

  if (errs.length) //Consolidate Error emails so we don't have email quota issues.  Most likely this order has already been shopped for so: "A sheet with the name XXX already exists. Please enter another name."
    debugEmail('Could not create shopping list', '#'+orderID, errs, order)

  var title = 'Shopping '+new Date().toJSON().slice(5,10)
  try {
    var sheet1 = ss.getSheetByName('Sheet1')
    if (sheet1)
      ss.deleteSheet(sheet1)
    else
      title = 'Re: '+title
  } catch (e) {
      //title = 'Re: '+title
      //infoEmail('Could not get sheet 1', title, e)
  }

  return '=HYPERLINK("'+ss.getUrl()+'", IF(NOW() - $OrderChanged > 4,  IF(NOW() - $OrderChanged > 7, "Not Filling", "Delayed"), "'+title+'"))'

  function createShoppingList(drug, order) {

    var v2name    = drug.$v2
    var minDays   = drug.$Days
    var minQty    = drug.$Qty


    if ( ! minDays || drug.$IsPended || drug.$IsDispensed || order.$Status == 'Dispensing') { //createShoppingLists gets called on a PER ORDER basis.  Some drugs in a Shopping Order may already be pended or dispensed
      //$Msg should already be set when minDays is 0.  drug.$Msg += ' did not shop because minDays is 0'
      return Log('createShoppingList no min days or is already pended/dispensed', drug.$Stock, drug.$Msg, orderID, v2name, minQty, minDays, drug)
    }

    if ( ! v2name || drug.$Stock == 'Shopping Sheet Error') { //Happens when the Live Inventory sheet was refreshing when being queried
      drug.$Msg = 'is awaiting manual inventory verification'
      return debugEmail('Shopping Error: Could not be shopped because of gcn or shopping sheet error (1)', drug.$Stock, drug.$Msg, '#'+orderID, v2name, minQty, minDays, drug)
    }

    var shopped = shopV2(drug, orderID)

    if ( ! shopped) {
      drug.$Msg = 'is waiting for manual inventory verification'
      return debugEmail('Shopping Error: Could not be shopped because not enough qty found - tabs/caps/X00? (2)', drug.$Stock, drug.$Msg, '#'+orderID, v2name, minQty, minDays, drug)
    }

    try {
      ss.insertSheet(v2name) //This will fail if sheet already exists, which prevents us from repending stock (when we delete a row to start a new sheet)

      var vals = [
        ['Order #'+orderID+' '+drug.$Name+' '+(new Date().toJSON()), '', '' ,'', ''],
        ['Days:'+minDays+', Qty:'+minQty+', Count:'+shopped.list.length+(drug.$Stock ? ' ('+drug.$Stock+')' : ''), '', '', '', ''],
        ['', '', '', '', '']
      ].concat(shopped.list)

      ss.getRange('A1:E'+vals.length).setValues(vals).setHorizontalAlignment('left').setFontFamily('Roboto Mono')

      //Pend after all forseeable errors are accounted for.
      var res = v2Fetch('http://52.8.112.88/account/8889875187/pend/'+orderID+' - '+minQty, 'POST', shopped.pend)

      infoEmail('V2 Pended', drug.$Name, v2name, '#'+orderID, minQty, shopped.pend, res, drug, order)

    } catch (e) {
      debugEmail('Shopping Error: was not shopped because already shopped (3)', e.stack, drug.$Name, v2name, '#'+orderID, minQty, drug, shopped.pend)
    }
  }
}

function testSheet() {
  var ss = openSpreadsheet('Shopping List #ADAM', 'Shopping Lists')
   ss.insertSheet('Test Drug 99mg')
   ss.getRange('A1:E2').setValues([['A1', 'B1', 'C1', 'D1', 'E1'],['A2', 'B2', 'C2', 'D2', 'E2']]).setHorizontalAlignment('left')
}

//Returns array on success and error string on failure
function shopV2(drug, orderID) {
  var $Name     = drug.$Name
  var v2name    = drug.$v2
  var minQty    = drug.$Qty
  var minDays   = drug.$Days
  var drugStock = drug.$Stock

  var minExp   = addTime((+minDays-2*7)*24).toJSON().slice(0, 7).split('-') //Used to use +14 days rather than -14 days as a buffer for dispensing and shipping. But since lots of prepacks expiring I am going to let almost expired things be prepacked
  var longExp  = addTime((+minDays+6*7)*24).toJSON().slice(0, 7) //2015-05-13 We want any surplus from packing fast movers to be usable for ~6 weeks.  Otherwise a lot of prepacks expire on the shelf

  var safety    = 0.15
  var startkey  = '["8889875187","month","'+minExp[0]+'","'+minExp[1]+'","'+v2name+'"]'
  var endkey    = '["8889875187","month","'+minExp[0]+'","'+minExp[1]+'","'+v2name+'",{}]'

  var url  = 'http://52.8.112.88/transaction/_design/inventory.qty-by-generic/_view/inventory.qty-by-generic?reduce=false&include_docs=true&limit=300&startkey='+startkey+'&endkey='+endkey
  var rows = v2Fetch(url)

  infoEmail('shopV2', $Name, v2name, 'orderID', '#'+orderID, 'minQty', minQty, 'minDays', minDays, 'drugStock', drugStock, 'url:', url, 'rows:', rows)

  var rowsB4sort = JSON.stringify(rows, null, '  ')

  //Organize by NDC since we don't want to mix them
  var ndcs = {}
  var caps = $Name.match(/ caps?| cps?\b| softgel/i) //"caps" to exclude caplet which is closer to a tablet
  var tabs = $Name.match(/ tabs?| tbs?\b/i)

  //Lots of prepacks were expiring because pulled stock with long exp was being paired with short prepack exp making the surplus shortdated
  //Default to longExp since that simplifies sort() if there are no prepacks
  var minPrepackExp = rows.reduce(function(minPrepackExp, row) {

    if ( ! row.doc.bin || ! row.doc.exp || ! row.doc.qty ) return minPrepackExp

    return row.doc.bin.length == 3 && row.doc.exp.to < minPrepackExp ? row.doc.exp.to : minPrepackExp

  }, longExp)


  //TODO test to see if this sorts things as we want.  In high stock, we want long exps first
  //but still want them to retain their ascending order of exps AND then we move to short exps
  //which should also retian their ascending order of exps
  rows.sort(function(a, b) {

    //Deprioritize ones that are missing data
    if ( ! b.doc.bin || ! b.doc.exp || ! b.doc.qty) return -1
    if ( ! a.doc.bin || ! a.doc.exp || ! a.doc.qty) return 1

    //Priortize prepacks over other stock
    var aPack = a.doc.bin.length == 3
    var bPack = b.doc.bin.length == 3
    if (aPack && ! bPack) return -1
    if (bPack && ! aPack) return 1

    //Let's shop for non-prepacks that are closest (but not less than) to our min prepack exp date in order to avoid waste
    aMonths = monthsBetween(minPrepackExp, a.doc.exp.to) // >0 if minPrepackExp < a.doc.exp.to (which is what we prefer)
    bMonths = monthsBetween(minPrepackExp, b.doc.exp.to) // >0 if minPrepackExp < b.doc.exp.to (which is what we prefer)

    //Deprioritize anything with a closer exp date than the min prepack exp date.  This - by definition - can only be non-prepack stock
    if (aMonths >= 0 && bMonths < 0) return -1
    if (bMonths >= 0 && aMonths < 0) return 1

    //Priorize anything that is closer to - but not under - our min prepack exp
    //If there is no prepack this is set to 3 months out so that any surplus has time to sit on our shelf
    if (aMonths >= 0 && bMonths >= 0 && aMonths < bMonths) return -1
    if (aMonths >= 0 && bMonths >= 0 && bMonths < aMonths) return 1

    //If they both expire sooner than our min prepack exp pick the closest
    if (aMonths < 0 && bMonths < 0 && aMonths > bMonths) return -1
    if (aMonths < 0 && bMonths < 0 && bMonths > aMonths) return 1

    //When choosing between two items of same type and same exp, choose the one with a higher quantity (less items to shop for).
    if (a.doc.qty.to > b.doc.qty.to) return -1
    if (b.doc.qty.to > a.doc.qty.to) return 1

    //keep sorting the same as the view (ascending NDCs) [doc.drug._id, doc.exp.to || doc.exp.from, sortedBin, doc.bin, doc._id]
    return 0
  })

  function monthsBetween(from, to) {
    to = new Date(to), from = new Date(from)
    return to.getMonth() - from.getMonth() + 12 * (to.getFullYear() - from.getFullYear());
  }

  var rowsB4filter = JSON.stringify(rows, null, '  ')

  //debugEmail('Shopping Now', $Name, v2name, minQty, minDays, drugStock, rows)

  for (var i in rows) {

    //Ignore Cindy's makeshift dispensed queue
    if (rows[i].doc.bin == 'X00') continue
    //Only select the correct form even though v2 gives us both
    if ( ~ rows[i].doc.drug.form.indexOf('Tablet') && caps) {
      var msg = 'may only be available in capsule form'
      continue
    }
    if ( ~ rows[i].doc.drug.form.indexOf('Capsule') && tabs) {
      var msg = 'may only be available in tablet form'
      continue
    }

    var ndc = rows[i].doc.drug._id
    ndcs[ndc] = ndcs[ndc] || []
    ndcs[ndc].prepackQty = ndcs[ndc].prepackQty || 0 //Hacky to set property on an array

    if (rows[i].doc.bin.length == 3)
      ndcs[ndc].prepackQty += rows[i].doc.qty.to

    ndcs[ndc].push(rows[i].doc)
  }

  var sortedNDCs = []
  //Sort the highest prepack qty first
  for (var ndc in ndcs) {
    sortedNDCs.push({ndc:ndc, inventory:ndcs[ndc]})
  }

  var rowsB4sortNDCs = JSON.stringify(sortedNDCs, null, '  ')

  //Sort in descending order of prepackQty.
  sortedNDCs.sort(function(a, b) { return b.inventory.prepackQty - a.inventory.prepackQty })
  //infoEmail('Shopping List Calculations', '#'+orderID, $Name, v2name, minQty, minDays, drugStock, url, rowsB4sort, rowsB4filter, rowsB4pend)

  var rowsB4pend = JSON.stringify(sortedNDCs, null, '  ')

  //if (rowsB4sortNDCs != rowsB4pend)
  //  debugEmail('Order of shopping changed based on prepackQty', 'before', rowsB4sortNDCs, 'after', rowsB4pend)

  var list = makeList(sortedNDCs, minQty, safety)
  if (list || minDays <= 45) return list

  infoEmail('Shopping Error: Not enough qty found, trying 45 days and no safety', '#'+orderID, $Name, v2name, minQty, minDays, drugStock, url, rowsB4sort, rowsB4filter, rowsB4sortNDCs, rowsB4pend)

  var list = makeList(sortedNDCs, +(45/minDays*minQty).toFixed(0), 0)
  if (list) return list

  /*
  Cindy thinks its best to do a manual intervention if we can't do at least 45 days.  For example, Order 6552 had minQty of 450 for Vitamin B12 (5x a day).
  infoEmail('Shopping Error: Not enough qty found, trying 30 days and no safety', '#'+orderID, $Name, v2name, minQty, minDays, drugStock, url, rowsB4sort, rowsB4filter, rowsB4pend)

  var list = makeList(ndcs, +(30/minDays*minQty).toFixed(0), 0)
  if (list) return list
  */

  drug.$Msg = msg || 'not enough qty found, must be pended manually'
  debugEmail('Shopping Error: Not enough qty found, must be pended manually', '#'+orderID, $Name, v2name, minQty, minDays)
}

function makeList(ndcs, minQty, safety) {
  for (var i in ndcs) {

    var ndc = ndcs[i].ndc
    var inventory = ndcs[i].inventory

    var list = []
    var pend = []
    var qty  = minQty

    for (var i in inventory) {

      if (i == 'prepackQty') continue

      if ( ! inventory[i].qty) {
        debugEmail('Shopping Error: qty not set', i, '|', inventory[i], '|', Object.keys(inventory), inventory)
        continue
      }

      pend.unshift(inventory[i])
      qty -= pend[0].qty.to * (pend[0].bin.length == 3 ? 1 : (1 - safety))
      list.push([pend[0].drug._id, pend[0].drug.form, pend[0].exp.to.slice(0, 7), pend[0].qty.to, pend[0].bin])

      if (qty <= 0) {
        //infoEmail('Pending the following transactions', v2name, pend)
        return {list:list.sort(sortList), ndc:ndc, pend:pend}
      }
    }
  }
}

function v2Fetch(url, method, body) {

  var opts = {
    method:method,
    payload:body ? JSON.stringify(body) : body,
    //contentType: 'application/json',
    muteHttpExceptions:true,
    escaping: false,
    headers:{Authorization:"Basic " + Utilities.base64Encode(V2_AUTH)}
  }

  try {
    var json = UrlFetchApp.fetch(encodeURI(url), opts).getContentText()
    if (method == 'POST') infoEmail('v2Fetch POST', url, encodeURI(url), json, opts.payload)
    return JSON.parse(json).rows
  } catch (e) {
    debugEmail('Could not fetch v2 Shopping List.  Is site down?', e, url, opts, json)
  }
}

function sortList(a, b) {

  var aBin = a[4]
  var bBin = b[4]

  var aPack = aBin && aBin.length == 3
  var bPack = bBin && bBin.length == 3

  if (aPack > bPack) return -1
  if (aPack < bPack) return 1

  //Flip columns and rows for sorting, since shopping is easier if you never move backwards
  var aFlip = aBin[0]+aBin[2]+aBin[1]+(aBin[3] || '')
  var bFlip = bBin[0]+bBin[2]+bBin[1]+(bBin[3] || '')

  if (aFlip > bFlip) return 1
  if (aFlip < bFlip) return -1

  return 0
}
