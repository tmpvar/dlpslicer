var SerialPort = require('serialport').SerialPort;


var stl = require('stl');
var split = require('split');
var argv = require('optimist').argv;
var cureTime = argv.cure || 500;
var resolution = argv.resolution || 0.1;
var skateboard = require('skateboard');

var model = [];
process.stdin.pipe(stl.createParseStream()).on('data', function(d) {
  if (d.description) {
    model.description = d.description
  } else {
    d.verts.forEach(function(vert) {
     Array.prototype.push.apply(model, vert);
    });
  }
});

var ready = false, open = false;

var sp = new SerialPort('/dev/tty.usbmodemfd121');

sp.once('open', function() {
  open = true;
});

process.stdin.on('end', function() {

  console.log('- read stl from stdin');

 
  sp.on('close', function() {
    console.log('serialpot lost');
  })

  var spReady = function() {
    setTimeout(function() {
      console.log('- serialport opened');

      skateboard(function(stream) {
        console.log('- new websocket client');

        var emit = function(type, value) {
          stream.write(JSON.stringify({
            type : type,
            value : value
          }));
          return true;
        };
        stream.pipe(process.stdout);

        emit('config', { resolution : resolution });

        var ticker = function() {
          ready && emit('tick', null) && console.log('tick');
          if (ready) {
            ready = false;
          }
        };

        var z = 0;
        stream.pipe(split()).on('data', function(line) {
          try {
            var obj = JSON.parse(line);
            if (obj.type === 'ready') {
              ready = true;
              setTimeout(function() {
                setTimeout(ticker, cureTime);
              }, 500);

              z+=resolution;
              sp.write('Z' + z.toPrecision(3) + '\n');
            } else if (obj.type === 'done') {
              console.log('DONE!');
              process.exit();
            }
          } catch (e) {
            console.log(e.stack);
          }
        });

        emit('model', model);
      });
      console.log('point a browser at http://localhost:8080');
    }, 1500);
  };

  if (!open) {
    sp.on('open', spReady);
  } else {
    spReady();
  }

});

