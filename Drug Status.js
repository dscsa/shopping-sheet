//4 Categories ACTION/NOACTION (determined here) and FILLING/NOT_FILLING (determined if $Days > 0)

//1) FILLING NO ACTION
//2) FILLING ACTION
//3) NOT FILLING ACTION
//4) NOT FILLING NO ACTION

var drugStatus = {

//NO ACTION BY USER NECESSARY

    NOACTION_PAST_DUE:{
      EN:'is past due and may be Med Synced to this Order *',
      ES:''
    },
    NOACTION_MAY_MEDSYNC: {
      EN:'is due soon and may be Med Synced to this Order *',
      ES:''
    },
    NOACTION_WAS_MEDSYNC: {
      EN:'was Med Synced to this Order *',
      ES:''
    },
    NOACTION_MEDSYNC_TO_DATE: {
      EN:'was Med Synced to $NextRefill *',
      ES:''
    },
    NOACTION_RX_OFF_AUTOFILL:{
      EN:'has autorefill off but was requested to be filled',
      ES:''
    },
    NOACTION_RECENT_FILL:{
      EN:'was filled recently and not due again until $NextRefill',
      ES:''
    },
    NOACTION_NOT_DUE:{
      EN:'is due for a refill on $NextRefill',
      ES:''
    },
    NOACTION_CHECK_SIG:{
      EN:'was prescribed in an unusually high qty and needs to be reviewed by a pharmacist',
      ES:''
    },
    NOACTION_MISSING_GCN:{
      EN:'needs to be checked to see if it is available',
      ES:''
    },
    NOACTION_LOW_STOCK:{
      EN:'is short filled because this drug is low in stock',
      ES:''
    },
    NOACTION_LOW_REFILL:{
      EN:'is short filled because this Rx had limited refills',
      ES:''
    },
    NOACTION_WILL_TRANSFER_CHECK_BACK:{
      EN:'is not currently offered and will be transferred to your local pharmacy. Check back in a month or two',
      ES:''
    },
    NOACTION_WILL_TRANSFER:{
      EN:'is not offered and will be transferred to your local pharmacy',
      ES:''
    },
    NOACTION_WAS_TRANSFERRED:{
      EN:'was transferred out to your local pharmacy on $RxChanged',
      ES:''
    },
    NOACTION_LIVE_INVENTORY_ERROR:{
      EN:'is awaiting manual inventory verification',
      ES:''
    },
    NOACTION_SHOPPING_ERROR:{
      EN:'is awaiting manual inventory retrieval',
      ES:''
    },

//ACTION BY USER REQUIRED BEFORE (RE)FILL

    ACTION_EXPIRING:{
      EN:'will expire soon, ask your doctor for a new Rx',
      ES:''
    },
    ACTION_LAST_REFILL:{
      EN:'has no more refills',
      ES:''
    },
    ACTION_NO_REFILLS:{
      EN:'is out of refills, contact your doctor',
      ES:''
    },
    ACTION_EXPIRED:{
      EN:'has expired, ask your doctor for a new Rx',
      ES:''
    },
    ACTION_EXPIRING:{
      EN:'will expire soon, ask your doctor for a new Rx',
      ES:''
    },
    ACTION_CHECK_BACK:{
      EN:'is unavailable for new RXs at this time, check back later',
      ES:''
    },
    ACTION_RX_OFF_AUTOFILL:{
      EN:'has autorefill turned off, request 2 weeks in advance',
      ES:''
    },
    ACTION_PAT_OFF_AUTOFILL:{
      EN:'was not filled because you have turned all medications off autorefill',
      ES:''
    },
    ACTION_NEEDS_FORM:{
      EN:'waiting on you to register',
      ES:''
    }
}

function setDrugStatus(drug, key, lang) {

  lang = lang || 'EN'

  if ( ! drugStatus[key] || ! drugStatus[key][lang])
    throw new Error(key+' drug status not defined')

  drug.$Status = drug.$Status
    ? key + ' < ' + drug.$Status
    : key //Keep Status History for Debugging

  drug.$Msg    = drugStatus[key][lang]
    .replace('$NextRefill', drug.$NextRefill)
    .replace('$RxChanged', drug.$RxChanged.slice(0, 10))
}

//IndexOf() because a overwritten status counts as well, not just the latest one
function hasDrugStatus(drug, status) {
  return drug.$Status && ~ drug.$Status.indexOf(status)
}
