
//""written_qty":"13.0","dispense_qty":"4.0","days_supply":"90.0","dispense_date":"2018-01-22","refill_date":"2018-02-18","sig_text"://
var complexSigRegEx = / then | and (?=\d)/

function parseSig(drug) {

  //TODO capture BOTH parts of "then" but for now just use second half
  //"1 capsule by mouth at bedtime for 1 week then 2 capsules at bedtime" --split
  //"Take 2 tablets in the morning and 1 at noon and 1 at supper" --split
  //"take 1 tablet (500 mg) by oral route 2 times per day with morning and evening meals" -- don't split
  //"Take 1 tablet by mouth every morning and 2 tablets in the evening" -- split
  var cleanedSigs = subsituteNumerals(drug.$Sig).split(complexSigRegEx).reverse()

  for (var i in cleanedSigs) {
    var cleanedSig = cleanedSigs[i]

    Log('cleanedSig', i, cleanedSig, cleanedSigs)

    var parsed = {
      raw:drug.$Sig,
      cleaned:cleanedSig,
      numDosage:getNumDosage(cleanedSig),
      freqNumerator:getFreqNumerator(cleanedSig),
      freqDemoninator:getFreqDemoninator(cleanedSig),
      frequency:getFrequency(cleanedSig)
    }

    if (parsed.numDosage && parsed.freqNumerator && parsed.freqDemoninator && parsed.frequency) {
      parsed.numDaily = parsed.numDosage * parsed.freqNumerator / parsed.freqDemoninator / parsed.frequency
      return parsed
    }

    debugEmail('Could not parse sig', drug.$Sig, '|'+cleanedSig+'|', parsed)
  }
}

function subsituteNumerals(sig) {
  sig = sig.replace(/\(.*?\)/g, '') //get rid of parenthesis // "Take 1 capsule (300 mg total) by mouth 3 (three) times daily."
  sig = sig.replace(/\\/g, '')   //get rid of backslashes

  sig = sig.replace(/(^| and | & )(1\/2|one-half) /ig, '.5 ') //Take 1 and 1/2 tablets or Take 1 & 1/2 tablets.  Could combine with next regex but might get complicated
  sig = sig.replace(/(\d+) (1\/2|one-half) /ig, '$1.5 ') //Take 1 1/2 tablets
  sig = sig.replace(/ (1\/2|one-half) /ig, ' .5 ')
  sig = sig.replace(/\bone /ig, '1 ') // \b is for space or start of line
  sig = sig.replace(/\btwo |\bother /ig, '2 ') // \b is for space or start of line
  sig = sig.replace(/\bthree /ig, '3 ') // \b is for space or start of line
  sig = sig.replace(/\bfour /ig, '4 ') // \b is for space or start of line
  sig = sig.replace(/\bfive /ig, '5 ') // \b is for space or start of line
  sig = sig.replace(/\bsix /ig, '6 ') // \b is for space or start of line
  sig = sig.replace(/\bseven /ig, '7 ') // \b is for space or start of line
  sig = sig.replace(/\beight /ig, '8 ') // \b is for space or start of line
  sig = sig.replace(/\bnine /ig, '9 ') // \b is for space or start of line
  sig = sig.replace(/\bten /ig, '10 ') // \b is for space or start of line
  sig = sig.replace(/\beleven /ig, '11 ') // \b is for space or start of line
  sig = sig.replace(/\btwelve /ig, '12 ') // \b is for space or start of line

  sig = sig.replace(/ hrs /ig, ' hours ')
  sig = sig.replace(/ once /ig, ' 1 time ')
  sig = sig.replace(/ twice | q12.*?h| BID\b|(?!every) 12 hours/ig, ' 2 times ')
  sig = sig.replace(/ q8.*?h| TID\b|(?!every) 8 hours/ig, ' 3 times ')
  sig = sig.replace(/ q6.*?h|(?!every) 6 hours/ig, ' 4 times ')

  sig = sig.replace(/\b1 vial /ig, '3ml ') // vials for inhalation are 2.5 or 3ml, so use 3ml to be conservative
  sig = sig.replace(/\b2 vials? /ig, '6ml ') // vials for inhalation are 2.5 or 3ml, so use 3ml to be conservative

  //Take Last (Max?) of Numeric Ranges
  sig = sig.replace(/[.\d]+ or ([.\d]+) /i, '$1 ') //Take 1 or 2 every 3 or 4 hours. Let's convert that to Take 2 every 3 or 4 hours (no global flag).  CK approves of first substitution but not sure of the 2nd so the conservative answer is to leave it alone
  sig = sig.replace(/[.\d]+ to ([.\d]+) /i, '$1 ') //Take 1 to 2 every 3 or 4 hours. Let's convert that to Take 2 every 3 or 4 hours (no global flag).  CK approves of first substitution but not sure of the 2nd so the conservative answer is to leave it alone
  sig = sig.replace(/[.\d]+-([.\d]+) /i, '$1 ') //Take 1-2 every 3 or 4 hours. Let's convert that to Take 2 every 3 or 4 hours (no global flag).  CK approves of first substitution but not sure of the 2nd so the conservative answer is to leave it alone

  sig = sig.replace(/ breakfast /ig, ' morning ')
  sig = sig.replace(/ dinner /ig, ' evening ')
  sig = sig.replace(/ mornings? and evenings? /ig, ' 2 times ')

  sig = sig.replace(/ hrs /ig, ' hours ')

  return sig.trim()
}

function getNumDosage(sig) {
  try {
    var numDosage = sig.match(/([0-9]?\.[0-9]+|[1-9]) (tab|cap|pill|softgel)/i)

    if (numDosage) return numDosage[1]

    numDosage = sig.match(/(^|use +|take +|inhale +|chew +|inject +|oral +)([0-9]?\.[0-9]+|[1-9])(?!\d* ?mg)/i)

    return numDosage ? numDosage[2] : 1 //"Use daily with lantus" won't match the RegEx above

  } catch (e) {}
}

function getFreqNumerator(sig) {
  var match = sig.match(/([1-9]\b|10|11|12) +time/i)
  Log('getFreqNumerator', sig, match)
  return match ? match[1] : 1
}

function getFreqDemoninator(sig) {
  var match = sig.match(/every ([1-9]\b|10|11|12)(?! +time)/i)
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
    //"Take 5 mg by mouth 2 (two) times daily.",
    //"Take 5 by mouth 2 (two) times daily.",
    //"Use 1 vial via neb every 4 hours"  //Should be 1620mls for a 90 day supply
    //"Take 1 tablet by mouth every morning and 2 tablets in the evening",
    //"Take 1 tablet by mouth every twelve hours",
    //"Take 1/2 tablet by mouth every day",
    //"Take 1-2 tablet by mouth at bedtime",
    //"1/2 tablet Once a day Orally 90 days",
    //"1 capsule every 8 hrs Orally 30 days",
    //"TAKE 1/2 TO 1 TABLET(S) by mouth EVERY DAY",
    //"TAKE 1/2 TO 2 TABLETS AT BEDTIME FOR SLEEP.",
    //"Take 60 mg daily  1 1\\/2 tablet",
    //"ORAL 1 q8-12h prn muscle spasm",
    //"Take 1 tablet (12.5 mg total) by mouth every 12 (twelve) hours",
    //"Take 1 capsule by mouth at bedtime for chronic back pain/ may increase 1 cap/ week x 3 weeks to 3 caps at bedtime", //NOT FIXED
    //"Take 1 tablet by mouth 3 times a day"
    //"Take 1 tablet by mouth 2 (two) times a day with meals."
    //"Take 1 tablet (5 mg total) by mouth 2 (two) times daily.",
    //"Take 1 tablet by mouth every other day"
  ]


  //TODO: NOT WORKING
  //"Take 2 tablet by mouth three times a day Take 2 with meals and 1 with snacks", //Not working
  //"Take 5 tablets by mouth 3 times a day with meals and 3 tablets 3 times a day with snack", //Not working
  //"Take 1 tablet by mouth every morning then 1/2 tablet in the evening", //Not working
  //2 am 2 pm ORAL three times a day
  //"Take 5 mg by mouth daily."

  for (var i in testSigs) {
    var parsed = parseSig({$Sig:testSigs[i]})
    Log(testSigs[i], parsed)
  }
}
