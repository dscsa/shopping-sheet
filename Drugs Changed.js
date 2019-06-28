//BECAUSE THIS IS RUN BEFORE ADDDRUGDETAILS (e.g Before Incorporating Live Inventory such as TotalQty, Low Stock, Refills Only, Out of Stock, etc) IT WILL
//NOT DETECT DRUGS THAT ARE "In Order" but go from 0 Days to >0 Days or go from >0 Days to 0 Days because of Live Inventory
function didDrugsChange(newDrugs, oldDrugs, $Status) {

  var changes = []

  if (newDrugs[0] && oldDrugs[0] && newDrugs[0].$OrderId != oldDrugs[0].$OrderId) {
    debugEmail('ABORTING didDrugsChange because OrderId Mismatch', newDrugs[0].$OrderId+' != '+oldDrugs[0].$OrderId, '$Status', $Status, 'newDrugs', newDrugs, 'oldDrugs', oldDrugs)
    throw new Error('didDrugsChange Drugs in wrong order '+newDrugs[0].$OrderId+' != '+oldDrugs[0].$OrderId)
  }

  //https://stackoverflow.com/questions/21987909/difference-between-two-array-of-objects-in-javascript
  for (var i in newDrugs) {

    var newDrug   = newDrugs[i]
    var drugAdded = newDrug.$Name+' ADDED TO PROFILE'+(newDrug.$InOrder ? ' AND ORDER' : '')

    for (var j in oldDrugs) {

      var oldDrug = oldDrugs[j]

      //Used to use GCN comparison but in rare cases Cindy would add two scripts of the same GCN into an order and then
      //didDrugChange would get triggered on every run because the refills would keep switching back and forth
      //UPDATE: Same problem with scriptNO but more rare. Order 13257 had same script number but different names
      //UPDATE: 13607 had scriptNo change but it was same drug which did (but should not) trigger an Order Update Email
      var scriptChanged = newDrug.$ScriptNo != oldDrug.$ScriptNo
      var gcnChanged    = newDrug.$Gcn && oldDrug.$Gcn && newDrug.$Gcn != oldDrug.$Gcn //Eliminate Gcn == 0 errors
      //var nameChanged   = (! newDrug.$Gcn || ! oldDrug.$Gcn) && newDrug.$Name.replace(/\^ *|\* */g, '').toUpperCase() != oldDrug.$Name.replace(/\^ *|\* */g, '').toUpperCase //Only if no GCN available

      /*if (newDrugs[0].$OrderId == 15396) {
         debugEmail('Order Debug', 'scriptChanged', scriptChanged, 'gcnChanged', gcnChanged, '$Status', $Status, 'newDrug', newDrug, 'oldDrug', oldDrug, 'newDrugs', newDrugs, 'oldDrugs', oldDrugs)
      }*/

      if (scriptChanged && gcnChanged) continue //This is the wrong drug, keep moving

      drugAdded = false //Match found so this is NOT a new drug

      //3 Possibilities
      //#1 scriptChanged && ! gcnChanged
      //#2 ! scriptChanged && gcnChanged
      //#3 ! scriptChanged && ! gcnChanged

      if (scriptChanged && (oldDrug.$InOrder == newDrug.$InOrder)) continue //#1 We have multiple scripts for same drug and we just switching between them.  Drug is not added so Order Updates won't be triggered.  See 15396 for why I put in, oldDrug.$InOrder == newDrug.$InOrder, order not updating from an old Rx with not refills once a new script with refills came in

      if (gcnChanged) {
        if (new Date().getMinutes() < 10) debugEmail('GCN Changed but ScriptNo did not', changes, '$Status', $Status, 'newDrugs', newDrugs, 'oldDrugs', oldDrugs) //#2 GCN changed without a scriptChange is weird, but keep going
        continue
      }
      //Now this is #2 and #3 ONLY

      //Switch from oldDrug.$InOrder to oldDrug.$Days because of 14793 getting an update of a drug that was "in order" but no days should not send update notices if it is removed from order
      //Added oldDrug.$InOrder because otherwise a drug not in the order but had days because it was med synced, would otherwise keep triggering this change
      if (oldDrug.$Days && oldDrug.$InOrder && ! newDrug.$InOrder) //Can't do this "|| (oldDrug.$Days > 0 && newDrug.$Days === 0)" because setDaysQtyRefills has not run yet so newDrug.$Days might be null because it hasn't been set yet
        changes.push(oldDrug.$Name+' -> '+newDrug.$Name+' REMOVED FROM ORDER '+oldDrug.$InOrder+' -> '+newDrug.$InOrder)

      else if ( ! oldDrug.$Days && ! oldDrug.$InOrder && newDrug.$InOrder) //Can't do this "|| (newDrug.$Days > 0 && oldDrug.$Days === 0)" because setDaysQtyRefills has not run yet so newDrug.$Days might not be 0 yet
        changes.push(oldDrug.$Name+' -> '+newDrug.$Name+' ADDED TO ORDER'+oldDrug.$InOrder+' -> '+newDrug.$InOrder)

      else if (newDrug.$RefillsLeft != oldDrug.$RefillsLeft) //"else if" because refills_left often change when adding a drug to an order - no need to double count
        changes.push(newDrug.$Name+' REFILLS CHANGED RefillsLeft:'+oldDrug.$RefillsLeft+' -> '+newDrug.$RefillsLeft)

      else if (newDrug.$RefillsTotal && ! oldDrug.$RefillsTotal) //"else if" because refills_left often change when adding a drug to an order - no need to double count
        changes.push(newDrug.$Name+' NEW SCRIPT WITH REFILLS: RefillsTotal: '+oldDrug.$RefillsTotal+' -> '+newDrug.$RefillsTotal)

      if (newDrug.$Autofill.rx == 0 && oldDrug.$Autofill.rx == 1) //Can't do this "|| (newDrug.$Days > 0 && oldDrug.$Days === 0)" because setDaysQtyRefills has not run yet so newDrug.$Days might not be 0 yet
        changes.push(newDrug.$Name+' AUTOFILL TURNED OFF')

      if (newDrug.$Autofill.rx == 1 && oldDrug.$Autofill.rx == 0) //Can't do this "|| (newDrug.$Days > 0 && oldDrug.$Days === 0)" because setDaysQtyRefills has not run yet so newDrug.$Days might not be 0 yet
        changes.push(newDrug.$Name+' AUTOFILL TURNED ON')

      if (newDrug.$Days != null && newDrug.$Days != oldDrug.$Days)
        changes.push(newDrug.$Name+' DAYS CHANGED '+oldDrug.$Days+' -> '+newDrug.$Days)

      if (newDrug.$Qty != null && newDrug.$Qty != oldDrug.$Qty)
        changes.push(newDrug.$Name+' QTY CHANGED '+oldDrug.$Qty+' -> '+newDrug.$Qty)

      if (newDrug.$Price != null && newDrug.$Price != oldDrug.$Price)
        changes.push(newDrug.$Name+' PRICE CHANGED '+oldDrug.$Price+' -> '+newDrug.$Price)

      if (newDrug.$Stock && newDrug.$Stock != oldDrug.$Stock && ~ ['No GCN', 'Sig Parse Error'].indexOf(oldDrug.$Stock)) //undefined != undefined, most statuses not yet set but this attempt to catch No GCNs and Shopping Sheet Error messages that appear or disappear.  Also can include "'Not Offered" status because that gets set latter so we will keep retriggering "'Not Offered" -> undefined.  11271 also had a loop
        changes.push(newDrug.$Name+' MSG CHANGED '+oldDrug.$Msg+' -> '+newDrug.$Msg+' STOCK CHANGED '+oldDrug.$Stock+' -> '+newDrug.$Stock)

      if (oldDrug.$TriggerChange && new Date().getMinutes() >= 55) {
        debugEmail('Trigger Drug Change Activated', 'oldDrug', oldDrug, 'newDrug', newDrug)
        changes.push('TRIGGER CHANGE ON OLD DRUG: '+JSON.stringify(oldDrug))
      }

      Log(changes.length ? 'Drug Changed!' : 'No Drug Changes', newDrug, oldDrug, changes)
    }

    if (drugAdded) //Because outer loop is only for newDrugs we only get drug ADDED to profile and not drugs REMOVED from profile
      changes.push(drugAdded)
  }

  if (changes.length) {
     debugEmail('DrugsChanged', changes, '$Status', $Status, 'newDrugs', newDrugs, 'oldDrugs', oldDrugs)
     return changes
  }
}
