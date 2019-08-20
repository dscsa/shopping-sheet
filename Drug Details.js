// qtyRemaining = Qty left in the Rx
// numDaily = Parse of sig normalized per day.  Take 3 caps 4 times every 2 weeks -> 3 * 4 / 2 / 7 -> 0.857
// daysSupply = MIN( qtyRemaining/numDaily, Price30/90, Medicine Sync)
// qtyDispensed = daysSupply * numDaily
// refillsRemaining = qtyRemaining / qtyDispensed - 1


//Notes on Guardian
//day_supply might not be reflect Cindy's changes to quantity
//refills_orig = refills not including orginal (so use refills_orig+1 to get total fills).  Sometimes
//refills_used = total fills including original
//refills_left = qtyRemaining / written_qty (note this is weird because if Rx was written as 30day and we change to 90, refills are still calculated based on 30)

//Notes on Guardian Calculations
//orginalQty = written_qty * (refills_orig+1)
//remainingQty = refills_left * written_qty
//remainingRefills = refills_left * written_qty / dispensedAty

//While we could do this in group by order, this saves expensive lookups and
//calculations to be only for the orders that we are actually adding or updating
function addDrugDetails(order, caller) {

  if (caller != 'addOrder') infoEmail('addDrugDetails by '+caller, order)

  for (var i in order.$Drugs) {

    var drug = order.$Drugs[i]

    setV2info(drug)
    Log(order.$OrderId, drug.$Name, "setV2info")

    drug.$NoTransfer = drug.$IsRefill || order.$Pharmacy.phone == '888-987-5187' || drug.$MonthlyPrice >= 20

    //Added because of Order #9554.  Meslamine was pended okay, but then a change of another drug, caused it to run again and this time the TotalQty was too low (because it had been pended) and gave patient a notification that it was too low to fill
    setDrugIsPended(drug)
    Log(order.$OrderId, drug.$Name, "setDrugIsPended")

    setDaysQtyRefills(drug)
    Log(order.$OrderId, drug.$Name, "setDaysQtyRefills")

    setSyncDate(order, drug)
    Log(order.$OrderId, drug.$Name, "setSyncDate")
  }

  order.$Drugs.sort(sortDrugs) //Must be called before setSyncDays

  for (var i in order.$Drugs) {

    var drug = order.$Drugs[i]

    setSyncDays(order, drug)
    Log(order.$OrderId, drug.$Name, "getSyncDays")

    setPriceTotal(order, drug) //Must call this after $Day and $MonthlyPrice are finalized
    Log(order.$OrderId, drug.$Name, "setPriceTotal")
  }

  setFeeDue(order)
}

//$Days (InOrder) > Group Message > Name
function sortDrugs(a, b) {

  if (a.$Days && ! b.$Days) return -1
  if (b.$Days && ! a.$Days) return 1

  var msgA = a.$Msg || ''
  var msgB = b.$Msg || ''

  if(msgA < msgB) { return -1 }
  if(msgB < msgA) { return  1 }

  //http://support.ecisolutions.com/doc-ddms/help/reportsmenu/ascii_sort_order_chart.htm
  var nameA = a.$Name.replace(/^[*] /, '[') //from * < A < ^ to A < * (now [) < ^
  var nameB = b.$Name.replace(/^[*] /, '[')

  if (nameA < nameB) return -1
  if (nameB < nameA) return 1

  return 0
}

function setDrugIsPended(drug) {
  drug.$IsPended = !! openSpreadsheet('Shopping List #'+drug.$OrderId, 'Shopping Lists').getSheetByName(drug.$v2) //This should be cached so not too expensive
}

function setDaysQtyRefills(drug) {

  if (drug.$IsDispensed)
    useDispensed(drug)

  else if ( ~ drug.$Name.indexOf(' INH'))
    useInhaler(drug)

  else
    useEstimate(drug)

  if ( ! drug.$Days && ~ ['MANUAL', 'WEBFORM'].indexOf(drug.$AddedToOrderBy))
    debugEmail('Manually added drug in Order but no days!  Why is this?', drug) //Most likely an autopopulated Rx that is not due yet)
}

function useDispensed(drug) {

   drug.$Days      = +drug.$DaysSupply
   drug.$Qty       = Math.round(drug.$DispenseQty) //Rounding because Order #4225 had some long decimals.
   drug.$Type      = "Dispensed"

   setRefills(drug, drug.$RefillsTotal)
}

//Inhalers might come with qty 18 (# of inhales/puffs rather than 1 so ignore these).  Not sure if these hardcoded assumptions are correct?  Cindy could need to dispense two inhalers per month?  Or one inhaler lasts more than a month?
function useInhaler(drug) {

  setStatus(drug)

  if (drug.$Days != null) return

  if (drug.$DaysSupply){ //Written in inhalers, but assume that the writtenQty is equal to 1 month
   drug.$Days = drug.$DaysSupply
   drug.$Qty  = drug.$DispenseQty
   drug.$Type = "Inhaler Refill"
  }
  //Could be written in milliliters since prescriber cannot prescribe over 12 months of inhalers at a time
  //Convert to Unit of Use by just assuming each inhaler is 30 days
  else {
   drug.$Days = 60
   drug.$Qty  = 2
   drug.$Type = "Inhaler New"
  }

  setRefills(drug, drug.$RefillsTotal - 1)
}

function useEstimate(drug) {

  setStatus(drug)

  if (drug.$Days != null) return

  var parsed = parseSig(drug)

  if ( ! parsed) {
    return drug.$Stock = (drug.$Stock || '') + 'Sig Parse Error'
  }

  drug.$Sig  = parsed

  var days_before_dispensed = Math.round(drug.$RemainingQty/parsed.numDaily, 0)
  var days_limited_totalqty = drug.$IsPended ? Infinity : Math.round(drug.$TotalQty/parsed.numDaily, 0)

  var stdDays = (drug.$Stock && drug.$TotalQty < 1000) ? 45 : 90 //Only do 45 day if its Low Stock AND less than 1000 Qty.  Cindy noticed we had 8000 Amlodipine but we were filling in 45 day supplies

  infoEmail('useEstimate', 'isLimited', days_limited_totalqty < Math.min(days_before_dispensed, stdDays), 'days_before_dispensed', days_before_dispensed, 'days_limited_totalqty', days_limited_totalqty, 'stdDays', stdDays, 'drug.$IsRefill', drug.$IsRefill, 'drug.$TotalQty', drug.$TotalQty, 'drug.$MonthlyPrice', drug.$MonthlyPrice, drug)

  if (days_limited_totalqty < Math.min(days_before_dispensed, stdDays)) {

    if ( ! drug.$NoTransfer) {
      set0Days(drug)
      setDrugStatus(drug, 'NOACTION_WILL_TRANSFER_CHECK_BACK')
      debugEmail('Low Quantity Transfer', parsed, 'days_before_dispensed', days_before_dispensed, 'days_limited_totalqty', days_limited_totalqty, 'stdDays', stdDays, 'drug.$IsRefill', drug.$IsRefill, 'drug.$TotalQty', drug.$TotalQty, 'drug.$MonthlyPrice', drug.$MonthlyPrice, drug)
      return
    }

    drug.$Days = days_limited_totalqty
    drug.$Type = "Estimate Limited Qty"
    setDrugStatus(drug, 'NOACTION_LOW_STOCK')
    debugEmail('Low Quantity Hold', parsed, 'days_before_dispensed', days_before_dispensed, 'days_limited_totalqty', days_limited_totalqty, 'stdDays', stdDays, 'drug.$IsRefill', drug.$IsRefill, 'drug.$TotalQty', drug.$TotalQty, 'drug.$MonthlyPrice', drug.$MonthlyPrice, drug)
  }

  else if (days_before_dispensed <= stdDays+30) {
    drug.$Days = days_before_dispensed
    drug.$Type = "Estimate Finish Rx"
  }

  else {
    drug.$Days = stdDays
    drug.$Type = "Estimate Std Days"
  }

  drug.$Qty = +Math.min(drug.$Days * parsed.numDaily, drug.$RemainingQty).toFixed(0) //Math.min added on 2019-01-02 because Order 9240 Promethizine had $Qty 42 > qty_before_dispensed Qty 40 because of rounding

  //This part is pulled from the CP_FillRx and CP_RefillRx SPs
  //See order #5307 - new script qty 90 w/ 1 refill dispensed as qty 45.  This basically switches the refills from 1 to 2, so after the 1st dispense there should still be one refill left
  var denominator = drug.$FirstRefill ? drug.$DispenseQty : drug.$WrittenQty  //DispenseQty will be pulled from previous Rxs.  We want to see if it has been set specifically for this Rx.
  setRefills(drug, drug.$RefillsTotal - drug.$Qty/denominator)
}

function setRefills(drug, refills) {

  if (refills < .1) {
    refills = 0
    if ( ! drug.$Status) setDrugStatus(drug, 'ACTION_LAST_REFILL')
  }

  drug.$Refills = +refills.toFixed(2)
}

function setStatus(drug) {

    var timeToExpiry  = toDate(drug.$RxExpires) - toDate(drug.$NextRefill)

    if (drug.$ScriptStatus == 'Transferred Out') {
      set0Days(drug)
      setDrugStatus(drug, 'NOACTION_WAS_TRANSFERRED')
    }
    else if (timeToExpiry < 0) {
      set0Days(drug) //Here rather than setDays so we don't have to repeat the conditional logic
      setDrugStatus(drug, 'ACTION_EXPIRED')
    }
    else if (drug.$RefillsTotal < .1) {
      set0Days(drug)
      setDrugStatus(drug, 'ACTION_NO_REFILLS')
    }
    else if (drug.$Stock == 'No GCN') {
      drug.$IsRefill ? triggerDrugChange(drug) : set0Days(drug)
      setDrugStatus(drug, 'NOACTION_MISSING_GCN')
    }
    else if (drug.$IsRefill && drug.$Stock == 'Not Offered') {
      triggerDrugChange(drug)
      setDrugStatus(drug, 'NOACTION_LIVE_INVENTORY_ERROR')
    }
    else if ( ! drug.$IsRefill && drug.$Stock == 'Not Offered') {
      set0Days(drug)
      setDrugStatus(drug, 'NOACTION_WILL_TRANSFER') //this is going to put it in a transfer out fax
    }
    else if ( ! drug.$v2) { //TODO Remove this after we confirm its never triggered
      setDrugStatus(drug, 'NOACTION_LIVE_INVENTORY_ERROR')
      debugEmail('Live Inventory Encountered An Error', drug)
    }
    else if ( ! drug.$IsRefill && ! drug.$IsPended && ~ ['Out of Stock', 'Refills Only'].indexOf(drug.$Stock)) {

      if (drug.$NoTransfer) {
        set0Days(drug)
        setDrugStatus(drug, 'ACTION_CHECK_BACK')
      } else {
        set0Days(drug)
        setDrugStatus(drug, 'NOACTION_WILL_TRANSFER_CHECK_BACK')
      }

    }
    else if (drug.$Autofill.patient == null) {//order.$Status == 'Needs Form' was messing up on #11121 since status showed as "Shopping" but this message still appeared
      setDrugStatus(drug, 'ACTION_NEEDS_FORM')
    }
    else if ( ! drug.$Autofill.patient) { //Drug is in order. Has registered (backup pharmacy) but autofill was turned off (Note: autofill is off until a patient registers)

      if (drug.$ManuallyAdded) {
        setDrugStatus(drug, 'NOACTION_RX_OFF_AUTOFILL')
      } else { //Out of Order or Added by SureScript
        set0Days(drug)
        setDrugStatus(drug, 'ACTION_PAT_OFF_AUTOFILL')
      }
    }
    else if ( ! drug.$Autofill.rx) { //Drug NOT in order. Has registered (backup pharmacy) but autofill was turned off (Note: autofill is off until a patient registers)

      if (drug.$InOrder) { //Added Manually or by SureScript
        setDrugStatus(drug, 'NOACTION_RX_OFF_AUTOFILL')
      } else {
        set0Days(drug)
        setDrugStatus(drug, 'ACTION_RX_OFF_AUTOFILL')
      }
    }
    else if ( ! drug.$InOrder && drug.$DaysToRefill < 0) {
      setDrugStatus(drug, 'NOACTION_PAST_DUE')
    }
    else if (drug.$DaysSinceRefill && drug.$DaysSinceRefill < maxMedSyncDays(drug)) {
      set0Days(drug)
      setDrugStatus(drug, 'NOACTION_RECENT_FILL')
    }
    else if ( ! drug.$ManuallyAdded && drug.$DaysToRefill > maxMedSyncDays(drug)) {
      set0Days(drug)
      setDrugStatus(drug, 'NOACTION_NOT_DUE')
    }
    else if (drug.$TotalQty < 2000 && drug.$Qty > drug.$DispenseQty && drug.$Qty > 2.5*drug.$RepackQty) {
      set0Days(drug)
      setDrugStatus(drug, 'NOACTION_CHECK_SIG')
    }
    else if (timeToExpiry < drug.$Days*24*60*60*1000) {
      setDrugStatus(drug, 'ACTION_EXPIRING')
    }
    //This will also catch drug.$DaysToRefill == ""
    else if (drug.$DaysToRefill <= minMedSyncDays(drug)) {
      setDrugStatus(drug, 'NOACTION_WAS_MEDSYNC') // Order #15736, Call Sheet #4949. was set to MAY MEDSYNC but then later removed from order by SYNC drugs.  Classifying as NOACTION_WAS_MEDSYNC will avoid this issue
    }
    //TODO id newQty/newDays > oldQty/oldDays then the sig changed and we should allow it to be filled early
    else if (drug.$InOrder && drug.$DaysToRefill > minMedSyncDays(drug)) {
      setDrugStatus(drug, 'NOACTION_WAS_MEDSYNC')
    }
    else if ( ! drug.$InOrder && drug.$DaysToRefill <= maxMedSyncDays(drug)) {
      setDrugStatus(drug, 'NOACTION_MAY_MEDSYNC')
    }
}

function set0Days(drug) {
  drug.$Days    = 0
  drug.$Qty     = 0
  drug.$Refills = drug.$RefillsTotal
}

//Will trigger a drug change on the hour
function triggerDrugChange(drug) {
  if (drug.$InOrder) drug.$TriggerChange = true
  debugEmail('Trigger Drug Change Set', drug)
}
