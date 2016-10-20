// 100 chars:
var BASE_PATTERN =
  '-ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890---!#$%^*()-' +
  '-abcdefghijklmnopqrstuvwxyz-!#$%^&*()--1234567890-'

var K = 1000;

// FUTURE TBD user-configured
var webSQL = false;
var androidDatabaseImplementation2 = false;
var extraBulkTestRecordCount = 20*K;
var extraBulkTestRecordSize = 100;
var bulkTestRecordCount = 50*K;
var bulkTestRecordSize = 100;
var populateAndReadRecordCount = 5*K;
var populateAndReadRecordSize = 1000;
var repeatedUpdateReadTestCount = 1*K;
var repeatedUpdateReadTestRecordSize = 200;

function cleanup(db) {
  return new Promise(function(resolve, reject) {
    db.transaction(function(tx) {
      tx.executeSql('DROP TABLE IF EXISTS tt');
    }, function(error) {
      reject(error);
    }, function() {
      resolve();
    });
  });
}

function getTestValues(charCount, recordCount) {
  var repeatCount = Math.floor(charCount/100);
  var i;

  var pattern = BASE_PATTERN;
  for (i=0; i<repeatCount; ++i) pattern += BASE_PATTERN;

  var values = [];
  for (i=0; i<recordCount; ++i)
    values.push(pattern+i);

  return values;
}

function bulkInsert(db, charCount, recordCount) {
  var repeatCount = Math.floor(charCount/100);

  var pattern = BASE_PATTERN;
  for (var j=0; j<repeatCount; ++j) pattern += BASE_PATTERN;

  return new Promise(function(resolve, reject) {
    db.transaction(function(tx) {
      tx.executeSql('DROP TABLE IF EXISTS tt');
      tx.executeSql('CREATE TABLE tt (id, value);');

      for (var i=0; i<recordCount; ++i)
        tx.executeSql('INSERT INTO tt VALUES (?,?);', [101+i, pattern+i]);
    }, function(error) {
      reject(error);
    }, function() {
      resolve();
    });
  });
}

function insertTestValues(db, values) {
  return new Promise(function(resolve, reject) {
    db.transaction(function(tx) {
      tx.executeSql('DROP TABLE IF EXISTS tt');
      tx.executeSql('CREATE TABLE tt (id, value);');

      var recordCount = values.length;
      for (var i=0; i<recordCount; ++i)
        tx.executeSql('INSERT INTO tt VALUES (?,?);', [101+i, values[i]]);
    }, function(error) {
      reject(error);
    }, function() {
      resolve();
    });
  });
}

function selectRecordCount(db) {
  return new Promise(function(resolve, reject) {

    db.transaction(function(tx) {
      tx.executeSql("SELECT COUNT(*) AS count FROM tt;", [], function(ignored, resultSet) {
        resolve(resultSet);
      });
    }, function(error) {
      reject(error);
    });
  });
}

function repeatedUpdateReadTest(db, repeatedUpdateReadTestValues) {
  var repeatCount = repeatedUpdateReadTestValues.length;

  return new Promise(function(resolve, reject) {
    db.transaction(function(tx) {
      tx.executeSql('DROP TABLE IF EXISTS tt');
      tx.executeSql('CREATE TABLE tt (id, value);');

      tx.executeSql('INSERT INTO tt VALUES (?,?);', [123, repeatedUpdateReadTestValues[0]]);
    }, function(error) {
      reject(error);
    }, function() {
      repeatStage(1);

      function repeatStage(index) {
        if (index === repeatCount) return resolve();

        db.transaction(function(tx) {
          tx.executeSql('UPDATE tt SET value=?', [repeatedUpdateReadTestValues[index]]);
        }, function(error) {
          reject(error);
        }, function() {
          db.transaction(function(tx) {
            tx.executeSql("SELECT * FROM tt;", [], function(ignored, resultSet) {
              if (!resultSet) throw new Error('FAILED: SELECT * MISSING valid resultSet');
              if (!resultSet.rows) throw new Error('FAILED: SELECT * MISSING valid resultSet.rows');
              if (!resultSet.rows.length) throw new Error('FAILED: SELECT * MISSING valid resultSet.rows.length');
              if (resultSet.rows.length !== 1) throw new Error('FAILED: SELECT * INCORRECT resultSet.rows.length value: ' + resultSet.rows.length);

              if (!resultSet.rows.item(0).id) throw new Error('MISSING VALID id field');
              if (!resultSet.rows.item(0).value) throw new Error('MISSING VALID value field');

              // XXX TBD strict numerical comparison fails on sqlite plugin 2 (Android)
              if (!(resultSet.rows.item(0).id == 123))
                 throw new Error('INCORRECT id field: ' + resultSet.rows.item(0).id);

              if (resultSet.rows.item(0).value !== repeatedUpdateReadTestValues[index])
                throw new Error('INCORRECT value field: ' + resultSet.rows.item(0).value);
            });
          }, function(error) {
            reject(error);
          }, function() {
            repeatStage(index+1);
          });
        });
      }
    });
  });
}

function sqlTest(resultHandler) {
  // FUTURE TBD delete old test.db first (??)
  var db = null;

  try {
    if (!Promise)
      return resultHandler('INVALID Promise object'); // [NOT EXPECTED]
  } catch(e) {
    return resultHandler('MISSING Promise object');
  }

  try {
    if (webSQL)
      db = window.openDatabase('test.db', '1.0', 'Test', 50*1000*1000);
    else
      db = window.sqlitePlugin.openDatabase({
        name: 'test.db',
        location: 'default',
        androidDatabaseImplementation: (androidDatabaseImplementation2 ? 2 : 'default')
      });
  } catch(e) {
    return resultHandler('FAILED due to openDatabase exception');
  }

  if (!db) return resultHandler('FAILED: no valid db handle'); // [NOT EXPECTED]

  var finish = function(resultText) {
    // Close if possible (not supported by sqlite plugin 2)
    if (!webSQL && !!db.close)
      db.close();
    resultHandler(resultText);
  }

  var cleanupAndFinish = function(resultText) {
    cleanup(db).then(function() {
      finish(resultText);
    }, function(error) {
      finish('CLEANUP error after result: ' + resultText);
    });
  }

  var values = getTestValues(populateAndReadRecordSize, populateAndReadRecordCount);

  var i;

  var bulkStartTime, bulkEndTime;
  var writeStartTime;
  var readStartTime, readEndTime;

  var extraBulkStartTime = Date.now();
  var extraBulkEndTime;

  bulkInsert(db, extraBulkTestRecordSize, extraBulkTestRecordCount).then(null, function(error) {
    cleanupAndFinish('FAILED: transaction error message: ' + error.message);
    return Promise.reject();

  }).then(function() {
    extraBulkEndTime = Date.now();
    return cleanup(db);

  }).then(null, function(error) {
    cleanupAndFinish('FAILED: cleanup error message: ' + error.message);
    return Promise.reject();

  }).then(function() {
    bulkStartTime = Date.now();
    return bulkInsert(db, bulkTestRecordSize, bulkTestRecordCount);

  }).then(null, function(error) {
    cleanupAndFinish('FAILED: transaction error message: ' + error.message);
    return Promise.reject();

  }).then(function() {
    bulkEndTime = Date.now();
    return cleanup(db);

  }).then(null, function(error) {
    cleanupAndFinish('FAILED: cleanup error message: ' + error.message);
    return Promise.reject();

  }).then(function() {
    writeStartTime = Date.now();
    return insertTestValues(db, values);

  }).then(null, function(error) {
    cleanupAndFinish('FAILED: transaction error message: ' + error.message);
    return Promise.reject();

  }).then(function() {
    readStartTime = Date.now();
    return selectRecordCount(db);

  }).then(null, function(error) {
    cleanupAndFinish('SELECT count FAIL: ' + error.message);
    return Promise.reject();

  }).then(function(resultSet) {
    if (!resultSet) return cleanupAndFinish('FAILED: MISSING valid resultSet');
    if (!resultSet.rows) return cleanupAndFinish('FAILED: MISSING valid resultSet.rows');
    if (!resultSet.rows.length) return cleanupAndFinish('FAILED: MISSING valid resultSet.rows.length');
    if (resultSet.rows.length !== 1) return cleanupAndFinish('FAILED: INCORRECT resultSet.rows.length value: ' + resultSet.rows.length);
    if (!resultSet.rows.item(0)) return cleanupAndFinish('FAILED: MISSING valid resultSet.rows.item(0)');
    if (!resultSet.rows.item(0).count) return cleanupAndFinish('FAILED: MISSING valid resultSet.rows.item(0).count');

    if (resultSet.rows.item(0).count !== populateAndReadRecordCount)
      return cleanupAndFinish('FAILED: INCORRECT resultSet.rows.item(0).count ' + resultSet.rows.item(0).count);

    return new Promise(function(resolve, reject) {
      db.transaction(function(tx) {
        tx.executeSql("SELECT * FROM tt;", [], function(ignored, resultSet) {
          if (!resultSet) throw new Error('MISSING valid resultSet');
          if (!resultSet.rows) throw new Error('MISSING valid resultSet.rows');
          if (!resultSet.rows.length) throw new Error('MISSING valid resultSet.rows.length');
          if (resultSet.rows.length !== populateAndReadRecordCount) throw new Error('INCORRECT resultSet.rows.length value: ' + resultSet.rows.length);

          for (i=0; i<populateAndReadRecordCount; ++i) {
            if (!resultSet.rows.item(i).id) throw new Error('MISSING VALID id field at index: ' + i);
            if (!resultSet.rows.item(i).value) throw new Error('MISSING VALID value field at index: ' + i);

            // XXX TBD strict numerical comparison fails on sqlite plugin 2 (Android)
            if (!(resultSet.rows.item(i).id == 101+i))
              throw new Error('INCORRECT VALID id field at index: ' + i + ' : ' + resultSet.rows.item(i).id);

            if (resultSet.rows.item(i).value !== values[i])
              throw new Error('INCORRECT VALID value field at index: ' + i + ' : ' + resultSet.rows.item(i).value);
          }

          readEndTime = Date.now();
          resolve();
        });

      }, function(error) {
        reject(error);
      });
    });

  }).then(null, function(error) {
    cleanupAndFinish('SELECT * CHECK FAILED: ' + error.message);
    return Promise.reject();

  }).then(function() {
    var repeatedUpdateReadTestValues = getTestValues(repeatedUpdateReadTestRecordSize, repeatedUpdateReadTestCount);
    repeatStartTime = Date.now();
    return repeatedUpdateReadTest(db, repeatedUpdateReadTestValues);

  }).then(null, function(error) {
    cleanupAndFinish('SELECT * CHECK FAILED: ' + error.message);
    return Promise.reject();

  }).then(function() {
    repeatEndTime = Date.now();

  }).then(function() {
    cleanupAndFinish(
      'SQL test OK. Extra bulk insert time (ms): ' + (extraBulkEndTime-extraBulkStartTime) +
      ' Bulk insert time (ms): ' + (bulkEndTime-bulkStartTime) +
      ' write time (ms): ' + (readStartTime-writeStartTime) +
      ' read time (ms): ' + (readEndTime-readStartTime) +
      ' repeated read/write time (ms): ' + (repeatEndTime-repeatStartTime));
  });
}

function start() {
  function handleResult(resultText) {
    navigator.notification.alert(
      'RESULT: ' + resultText + ' (confirm to repeat)',
       start, 'Cordova SQL Test');
  }
  sqlTest(handleResult);
}

document.addEventListener('deviceready', function() {
  //navigator.notification.alert('received deviceready event', start, 'Cordova SQL Test');
  start();
});
