// 100 chars:
var base =
  '-ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890---!#$%^*()-' +
  '-abcdefghijklmnopqrstuvwxyz-!#$%^&*()--1234567890-'

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

  var pattern = base;
  for (i=0; i<repeatCount; ++i) pattern += base;

  var values = [];
  for (i=0; i<recordCount; ++i)
    values.push(pattern+i);

  return values;
}

function bulkInsert(db, charCount, recordCount) {
  var repeatCount = Math.floor(charCount/100);

  var pattern = base;
  for (var j=0; j<repeatCount; ++j) pattern += base;

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

function sqlTest(resultHandler) {
  // FUTURE TBD user-configured
  var bulk_record_count = 70*1000;
  var record_count = 5*1000;
  var char_count = 1000;

  var full_check = true;

  // FUTURE TBD delete old test.db first
  var db = window.sqlitePlugin.openDatabase({name: 'test.db', location: 'default'});

  if (!db) return resultHandler('FAILED: no valid db handle');

  var finish = function(resultText) {
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

  var values = getTestValues(char_count, record_count);

  var i;

  var startTime = Date.now();
  var startTime1;

  bulkInsert(db, 100, bulk_record_count).then(null, function(error) {
    cleanupAndFinish('FAILED: transaction error message: ' + error.message);
    return Promise.reject();

  }).then(function() {
    return cleanup(db);

  }).then(null, function(error) {
    cleanupAndFinish('FAILED: cleanup error message: ' + error.message);
    return Promise.reject();

  }).then(function() {
    startTime1 = Date.now();
    return insertTestValues(db, values);

  }).then(null, function(error) {
    cleanupAndFinish('FAILED: transaction error message: ' + error.message);
    return Promise.reject();

  }).then(function() {
    var startReadTime = Date.now();

    var count_check = false;

    db.transaction(function(tx) {
      tx.executeSql("SELECT COUNT(*) AS count FROM tt;", [], function(ignored, resultSet) {
        if (!resultSet) return cleanupAndFinish('FAILED: MISSING valid resultSet');
        if (!resultSet.rows) return cleanupAndFinish('FAILED: MISSING valid resultSet.rows');
        if (!resultSet.rows.length) return cleanupAndFinish('FAILED: MISSING valid resultSet.rows.length');
        if (resultSet.rows.length !== 1) return cleanupAndFinish('FAILED: INCORRECT resultSet.rows.length value: ' + resultSet.rows.length);
        if (!resultSet.rows.item(0)) return cleanupAndFinish('FAILED: MISSING valid resultSet.rows.item(0)');
        if (!resultSet.rows.item(0).count) return cleanupAndFinish('FAILED: MISSING valid resultSet.rows.item(0).count');

        if (resultSet.rows.item(0).count !== record_count)
          return cleanupAndFinish('FAILED: INCORRECT resultSet.rows.item(0).count ' + resultSet.rows.item(0).count);

        count_check = true;
      });

    }, function(error) {
      cleanupAndFinish('FAILED: transaction error message: ' + error.message);

    }, function() {
      if (!count_check) return cleanupAndFinish('FAILED: MISSING COUNT result');

      if (!full_check) {
        var stopTime = Date.now();
        cleanupAndFinish(
          'SQL test OK write time (ms): ' + (startReadTime-startTime) +
          ' read count time (ms): ' + (stopTime-startReadTime));
      }

      db.transaction(function(tx) {
        tx.executeSql("SELECT * FROM tt;", [], function(ignored, resultSet) {
          if (!resultSet) return cleanupAndFinish('FAILED: SELECT * MISSING valid resultSet');
          if (!resultSet.rows) return cleanupAndFinish('FAILED: SELECT * MISSING valid resultSet.rows');
          if (!resultSet.rows.length) return cleanupAndFinish('FAILED: SELECT * MISSING valid resultSet.rows.length');
          if (resultSet.rows.length !== record_count) return cleanupAndFinish('FAILED: SELECT * INCORRECT resultSet.rows.length value: ' + resultSet.rows.length);

          for (i=0; i<record_count; ++i) {
            if (!resultSet.rows.item(i).id) return cleanupAndFinish('MISSING VALID id field at index: ' + i);
            if (!resultSet.rows.item(i).value) return cleanupAndFinish('MISSING VALID value field at index: ' + i);

            if (resultSet.rows.item(i).id !== 101+i)
              return cleanupAndFinish('INCORRECT VALID id field at index: ' + i + ' : ' + resultSet.rows.item(i).id);

            if (resultSet.rows.item(i).value !== values[i])
              return cleanupAndFinish('INCORRECT VALID value field at index: ' + i + ' : ' + resultSet.rows.item(i).value);
          }

          var endTime = Date.now();
          //cleanupAndFinish('SQL test OK in ms: ' + (endTime - startTime));
          cleanupAndFinish(
            'SQL test OK bulk insert time (ms): ' + (startTime1-startTime) +
            ' write time (ms): ' + (startReadTime-startTime1) +
            ' read time (ms): ' + (endTime-startReadTime));
        });

      }, function(error) {
        cleanupAndFinish('FAILED: SELECT * transaction error message: ' + error.message);

      });

    });

  });
}

function sqlStringTest(resultHandler) {
  var db = window.sqlitePlugin.openDatabase({name: 'test.db', location: 'default'});

  if (!db) return resultHandler('FAILED: no valid db handle');

  db.transaction(function(tx) {
    tx.executeSql("SELECT upper('Test string') AS upper_text", [], function(ignored, resultSet) {
      if (!resultSet) return resultHandler('FAILED: MISSING valid resultSet');
      if (!resultSet.rows) return resultHandler('FAILED: MISSING valid resultSet.rows');
      if (!resultSet.rows.length) return resultHandler('FAILED: MISSING valid resultSet.rows.length');
      if (resultSet.rows.length !== 1) return resultHandler('FAILED: INCORRECT resultSet.rows.length value: ' + resultSet.rows.length);
      if (!resultSet.rows.item(0)) return resultHandler('FAILED: MISSING valid resultSet.rows.item(0)');
      if (!resultSet.rows.item(0).upper_text) return resultHandler('FAILED: MISSING valid resultSet.rows.item(0).upper_text');

      resultHandler('RESULT: GOT resultSet.rows.item(0).upper_text: ' + resultSet.rows.item(0).upper_text);
    });
  }, function(error) {
    resultHandler('FAILED: transaction error message: ' + error.message);
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
