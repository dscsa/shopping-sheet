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


function testParseSig() {
  var testSigs = [
   /* "Use 4 vials in nebulizer as directed in the morning and evening",
    "Take 1 tablet (12.5 mg) by mouth daily in the morning",
    "Take 1 tablet (80 mg) by mouth daily",
    "1 tablet by mouth every day",
    "1 Tab(s) by Oral route 1 time per day",
    "take 1 tablet (25 mg) by oral route once daily",
    "1 capsule by Oral route 1 time per week",
    "take 1 tablet (150 mg) by oral route 2 times per day",
    "take 1 tablet (20 mg) by oral route once daily",
    "1 capsule by mouth every day on empty stomach",
    "1 capsule by mouth every day",
    "TAKE ONE CAPSULE BY MOUTH THREE TIMES A WEEK ON MONDAY, WEDNESDAY, AND FRIDAY",
    "take 1 tablet (100 mg) by oral route once daily",
    "Take 1 tablet (25 mg) by oral route once daily",
    "take 1 tablet (10 mg) by oral route once daily in the evening",
    "take 2 tablet by Oral route 1 time per day",
    "Inject 1ml intramuscularly once a week as directed",
    "3 ml every 6 hrs Inhalation 90 days",
    "1.5 tablets at bedtime",
    "1 capsule by mouth at bedtime for 1 week then 2 capsules at bedtime",
    "Take 1 capsule (300 mg total) by mouth 3 (three) times daily.",
    "take 2 tabs PO daily",
    "take one PO qd",
    "Take 1 tablet (15 mg) by mouth 2 times per day for 21 days with food, then increase to 20 mg BID",
    "Take one tablet every 12 hours",
    "1 tablet 4 times per day on an empty stomach,1 hour before or 2 hours after a meal",
    "1 tablet 4 times per day as needed on an empty stomach,1 hour before or 2 hours after a meal",
    "ORAL 1 TAB PO QAM PRN SWELLING",
    "one tablet ORAL every day",
    "take 1 tablet by oral route  every 8 hours as needed for nausea",
    "Take 2 tablets in the morning and 1 at noon and 1 at supper", //UNFIXED
    "1 at noon",
    "Take  One capsule by mouth four times daily.",
    "1 tab(s) PO BID,x30 day(s)",
    "Inject 1 each under the skin 3 (three) times a day  To test sugar DX e11.9",
    "Use daily with lantus",
    "take 1 tablet by Oral route 3 times per day with food as needed for pain",
    "Take 1 capsule daily for 7 days then increase to 1 capsule twice daily"  //UNFIXED BUT USING 2nd RATHER THAN 1st HALF
    "take 1 tablet (500 mg) by oral route 2 times per day with morning and evening meals" */
    //"Take 1 tablet (12.5 mg total) by mouth every 12 (twelve) hours",
    //"1 ORAL every eight hours as needed",
    "Take 5 mg by mouth 2 (two) times daily.",
    "Take 5 by mouth 2 (two) times daily."
  ]
    //2 am 2 pm ORAL three times a day
  //"Take 5 mg by mouth daily."
  for (var i in testSigs) {
    var parsed = parseSig({$Sig:testSigs[i]})
    Log(testSigs[i], parsed)
  }
}

//""written_qty":"13.0","dispense_qty":"4.0","days_supply":"90.0","dispense_date":"2018-01-22","refill_date":"2018-02-18","sig_text"://

function setDaysQtyRefills(drug, order) {

  var lowStock = drug.$Stock && drug.$TotalQty < 1000 //Only do 45 day if its Low Stock AND less than 1000 Qty.  Cindy noticed we had 8000 Amlodipine but we were filling in 45 day supplies

  //For out of stock and refills only that still have days supply really high
  var stockChanged =  (lowStock && (drug.$DaysSupply > 75)) || ( ! lowStock && (drug.$DaysSupply < 60)) //If this was med synced or didn't have a lot left on Rx then adjust back to our regular qtys

  //LastRefill rather than order.$Dispensed because there is some intermediate time between the drug being dispensed and the order being shipped
  var today = Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd")

  var leftoverQty = (drug.$WrittenQty*drug.$RefillsLeft) % drug.$DispenseQty

  if (drug.$IsDispensed)
    useDispensed(drug)

  //TODO should we just get rid of useRefill Completely.  Seems like a VERY narrow use case
  else if (drug.$DispenseQty && drug.$DaysSupply >= 45 && ! leftoverQty && ! stockChanged) //don't do a refill of something supershort like 15 or 30 days.  Modulus so we only do refill quantity if we can keep qty the same without an leftover qty on RX. This is because CK would have preferred Order 1151 to go back up to 90 days rather than a Refill of 60 Days (set because of Med Sync)
    useRefill(drug)

  else if ( ~ drug.$Name.indexOf(' INH') && drug.$WrittenQty > 1)
    useInhaler(drug)

  else
    useEstimate(drug)

  var msg = excludeFromOrder(drug, order)
  if (msg) {   //infoEmail('Setting 0 Days', msg, 'drug.$Stock', drug.$Stock, 'drug.$TotalQty < drug.$Qty', drug.$TotalQty < drug.$Qty, 'drug', drug)
    drug.$Msg  = msg
    drug.$Days = 0 //Price is not yet set do no need to reset it here.  New Patients don't get out of stock drugs - they are reserved for refills only.  Set days to 0 after qty is set so we don't get 0 qty too
  } else if ( ! drug.$InOrder) {
    drug.$Name = drug.$Name.replace('*', '^')
  }

  setPrice(drug)
}

function useDispensed(drug) {

   drug.$Days      = +drug.$DaysSupply
   drug.$Qty       = Math.round(drug.$DispenseQty) //Rounding because Order #4225 had some long decimals.
   drug.$Refills   = drug.$Refills || +(drug.$RefillsTotal).toFixed(2) //Default of Rx Expiring
   drug.$Type      = "Dispensed"
}

function useRefill(drug) {
   //if (drug.$RefillsLeft <= 0) debugEmail('useRefill but has NO refills', drug)

   drug.$Qty         = Math.min(drug.$DispenseQty, drug.$WrittenQty*drug.$RefillsLeft)
   drug.$Days        = Math.round(drug.$DaysSupply * drug.$Qty / drug.$DispenseQty)
   drug.$Refills     = drug.$Refills || +(drug.$RefillsTotal - drug.$Qty/drug.$WrittenQty).toFixed(2) //Refills AFTER it is dispensed.  Default is Rx Expiring
   drug.$Type        = "Refill"
}

//Inhalers might come with qty 18 (# of inhales/puffs rather than 1 so ignore these).  Not sure if these hardcoded assumptions are correct?  Cindy could need to dispense two inhalers per month?  Or one inhaler lasts more than a month?
function useInhaler(drug) {
   drug.$Days    = 30
   drug.$Qty     = 1
   drug.$Refills = +(drug.$RefillsTotal - 1).toFixed(2)
   drug.$Type    = "Inhaler"
}

function useEstimate(drug) {

  var parsed = parseSig(drug)

  if ( ! parsed) {
    return drug.$Stock = (drug.$Stock || '') + 'Sig Parse Error'
  }

  parsed.numDaily = parsed.numDosage * parsed.freqNumerator / parsed.freqDemoninator / parsed.frequency

  var qty_before_dispensed = drug.$WrittenQty * drug.$RefillsLeft
  var days_before_dispensed = Math.round(qty_before_dispensed/parsed.numDaily, 0)

  var stdDays = (drug.$Stock && drug.$TotalQty < 1000) ? 45 : 90 //Only do 45 day if its Low Stock AND less than 1000 Qty.  Cindy noticed we had 8000 Amlodipine but we were filling in 45 day supplies

  //TODO Include Medicine Sync inside of Math.min()
  //High Supply: If <= 120 (90+30) then dispense all at once.  If > 120 then split it into two fills.
  //Low Supply: If <= 75 (45+30) then dispense all at once).  If > 75 then split into two fills
  drug.$Days = days_before_dispensed <= stdDays+30 ? days_before_dispensed : stdDays
  drug.$Qty  = +Math.min(drug.$Days * parsed.numDaily, qty_before_dispensed).toFixed(0) //Math.min added on 2019-01-02 because Order 9240 Promethizine had $Qty 42 > qty_before_dispensed Qty 40 because of rounding
  drug.$Type = "Estimate"
  if ( ! drug.$Refills) setRefills(drug) //Default is Rx Expiring

  //if (drug.$DaysSupply && drug.$DispenseQty)
  //  debugEmail('"useEstimate" rather than "useRefill', drug)
}

//She does this so that the Refill % Calculated by Guardian makes more sense rather than having a lot of refills and have each dispense reduce them by >1.
function setRefills(drug) {
  //This part is pulled from the CP_FillRx and CP_RefillRx SPs
  //See order #5307 - new script qty 90 w/ 1 refill dispensed as qty 45.  This basically switches the refills from 1 to 2, so after the 1st dispense there should still be one refill left
  var denominator = drug.$IsRefill ? drug.$DispenseQty : drug.$WrittenQty //DispenseQty will be pulled from previous Rxs.  We want to see if it has been set specifically for this Rx.
  drug.$Refills = +(drug.$RefillsTotal - drug.$Qty/denominator).toFixed(2)
  if (drug.$Refills < .1) drug.$Refills = 0
}
/*
function OLDsetRefills(drug) {
  //This part is pulled from the CP_FillRx and CP_RefillRx SPs
  //See order #5307 - new script qty 90 w/ 1 refill dispensed as qty 45.  This basically switches the refills from 1 to 2, so after the 1st dispense there should still be one refill left
  var refillAdj = (drug.$DaysSupply || drug.$DispenseQty) ? 1 : drug.$WrittenQty/drug.$Qty
  drug.$Refills = +(drug.$RefillsTotal*refillAdj - 1).toFixed(2)
  if (drug.$Refills < .1) drug.$Refills = 0
}
*/

function setPrice(drug) {
  drug.$Price = +Math.max(drug.$Days * drug.$MonthlyPrice / 30, drug.$Days ? 1 : 0).toFixed(0) //Minimum price of $1 (CK suggestion).  2019-01-28 Changed $Excluded to $Days because of Order 8235 and 8291
}

function parseSig(drug) {

  //TODO capture BOTH parts of "then" but for now just use second half
  //"1 capsule by mouth at bedtime for 1 week then 2 capsules at bedtime" --split
  //"Take 2 tablets in the morning and 1 at noon and 1 at supper" --split
  //"take 1 tablet (500 mg) by oral route 2 times per day with morning and evening meals" -- don't split
  var cleanedSigs = drug.$Sig.split(/ then | and \d/).reverse()

  for (var i in cleanedSigs) {
    var cleanedSig = subsituteNumerals(cleanedSigs[i])

    var parsed = {
      numDosage:getNumDosage(cleanedSig),
      freqNumerator:getFreqNumerator(cleanedSig),
      freqDemoninator:getFreqDemoninator(cleanedSig),
      frequency:getFrequency(cleanedSig)
    }

    if (parsed.numDosage && parsed.freqNumerator && parsed.freqDemoninator && parsed.frequency)
      return parsed

    Log('Could not parse sig', drug.$Sig, '|'+cleanedSig+'|', parsed)
    drug.$Msg = (drug.$Msg || '') + "Sig Parse Error"
  }
}

function subsituteNumerals(sig) {
  sig = sig.replace(/[()]/g, '') //get rid of parenthesis // "Take 1 capsule (300 mg total) by mouth 3 (three) times daily."
  sig = sig.replace(/( and| &) 1\/2 /ig, '.5 ') //Take 1 and 1/2 tablets or Take 1 & 1/2 tablets.  Could combine with next regex but might get complicated
  sig = sig.replace(/ 1\/2| one-half/ig, ' .5 ')
  sig = sig.replace(/ once /ig, ' 1 time ')
  sig = sig.replace(/ twice | q12h| BID\b|(?!every) 12 hours/ig, ' 2 times ')
  sig = sig.replace(/ q8h| TID\b|(?!every) 8 hours/ig, ' 3 times ')
  sig = sig.replace(/ q6h|(?!every) 6 hours/ig, ' 4 times ')
  sig = sig.replace(/\bone /ig, '1 ') // \b is for space or start of line
  sig = sig.replace(/\btwo | other /ig, '2 ') // \b is for space or start of line
  sig = sig.replace(/\bthree /ig, '3 ') // \b is for space or start of line
  sig = sig.replace(/\bfour /ig, '4 ') // \b is for space or start of line
  sig = sig.replace(/\bfive /ig, '5 ') // \b is for space or start of line
  sig = sig.replace(/\bsix /ig, '6 ') // \b is for space or start of line
  sig = sig.replace(/\bseven /ig, '7 ') // \b is for space or start of line
  sig = sig.replace(/\beight /ig, '8 ') // \b is for space or start of line
  sig = sig.replace(/\bnine /ig, '9 ') // \b is for space or start of line

  sig = sig.replace(/ breakfast /ig, ' morning ')
  sig = sig.replace(/ dinner /ig, ' evening ')
  sig = sig.replace(/ mornings? and evenings? /ig, ' 2 times ')

  sig = sig.replace(/ hrs /ig, ' hours ')

  return sig.trim()
}

function getNumDosage(sig) {
  try {
    var numDosage = sig.match(/(^|use +|take +|inhale +|chew +|inject +|oral +)([0-9]?\.[0-9]+|[1-9])(?! ?mg)/i)
    return numDosage ? numDosage[2] : 1 //"Use daily with lantus" won't match the RegEx above
  } catch (e) {}
}

function getFreqNumerator(sig) {
  var match = sig.match(/([1-9]\b|10|11|12) time/i)
  Log('getFreqNumerator', sig, match)
  return match ? match[1] : 1
}

function getFreqDemoninator(sig) {
  var match = sig.match(/every ([1-9]\b|10|11|12)(?! time)/i)
  Log('getFreqDemoninator', sig, match)
  return match ? match[1] : 1
}

//Returns frequency in number of days (e.g, weekly means 7 days)
function getFrequency(sig) {

  var freq = 1 //defaults to daily if no matches

  if (sig.match(/ day| daily/i))
    freq = 1

  else if (sig.match(/ week| weekly/i))
    freq = 30/4 //rather than 7 days, calculate as 1/4th a month so we get 45/90 days rather than 42/84 days

  else if (sig.match(/ month| monthly/i))
    freq = 30

  else if (sig.match(/( hours?| hourly)(?! before| after| prior to)/i)) //put this last so less likely to match thinks like "2 hours before (meals|bedtime) every day"
    freq = 1/24 // One 24th of a day

  if (sig.match(/ prn| as needed/i)) //Not mutually exclusive like the others. TODO: Does this belong in freq demoninator instead? TODO: Check with Cindy how often does as needed mean on average.  Assume once every 3 days for now
    freq *= 1 // I had this as 3 which I think is approximately correct, but Cindy didn't like so setting at 1 which basically means we ignore for now

  //Default to daily Example 1 tablet by mouth at bedtime
  return freq
}
