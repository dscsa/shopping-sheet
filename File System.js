
function fileByName(name) {
  return DriveApp.getFilesByName(name).next()
}

function folderByName(name) {
  return DriveApp.getFoldersByName(name).next()
}

function parentByFile(file) {

  try {
    return file.getParents().next()
  } catch(e) {
    return DriveApp.getRootFolder()
  }
}

function makeCopy(oldFile, copyName, copyFolder) {
   var newFile = oldFile.makeCopy(copyName)
   parentByFile(newFile).removeFile(newFile)
   folderByName(copyFolder).addFile(newFile)
   publishToWeb(newFile)
   return DocumentApp.openById(newFile.getId())
}

//Drive (not DriveApp) must be turned on under Resources -> Advanced Google Services -> Drive
//https://stackoverflow.com/questions/40476324/how-to-publish-to-the-web-a-spreadsheet-using-drive-api-and-gas
function publishToWeb(file){
  file.setOwner('admin@sirum.org') //support@goodpill.org can only publish files that require sirum sign in
  var fileId = file.getId()
  var revisions = Drive.Revisions.list(fileId);
  var items = revisions.items;
  var revisionId = items[items.length-1].id;
  var resource = Drive.Revisions.get(fileId, revisionId);
  resource.published = true;
  resource.publishAuto = true;
  resource.publishedOutsideDomain = true;
  resource = Drive.Revisions.update(resource, fileId, revisionId);
}

function newSpreadsheet(name, folder) {

  var ss   = SpreadsheetApp.create(name)
  var file = DriveApp.getFileById(ss.getId())

  moveToFolder(file, folder)

  return ss
}

var ssCache = {}
function openSpreadsheet(name, folder) {

  if (ssCache[folder+name]) return ssCache[folder+name]

  var files = DriveApp.getFilesByName(name)

  if ( ! files.hasNext())
    return ssCache[folder+name] = newSpreadsheet(name, folder)

  return ssCache[folder+name] = SpreadsheetApp.openById(files.next().getId())
}

function moveToFolder(file, folder) {
  if ( ! folder ) return
  parentByFile(file).removeFile(file)
  folderByName(folder).addFile(file)
  return file
}
