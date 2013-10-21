(function() {
  function debug(a) {
    console.log(JSON.stringify(a, null, '  '))
  }

  var id = 0;
  var vertexLinkage = {};
  function Vertex(x, y, z) {
    this.position = vec3.createFrom(x, y, z);
    var key = this.key();
    if (!vertexLinkage[key]) {
      this.id = id++;
      this.links = [];
      this.linkIds = {};
      vertexLinkage[key] = this;
    }

    return vertexLinkage[key];
  }

  var near = function(a, b) {
    return Math.abs(a-b) <= 0.000000000001;
  }

  Vertex.prototype = {
    key : function() {
      return Array.prototype.join.call(this.position, ',');
    },
    addLink : function(vertex) {
      if (!this.linkIds[vertex.id]) {
        this.links.push(vertex);
        this.linkIds[vertex.id] = true;
      }
      return this;
    },
    test : function(plane, skipIds) {
      skipIds = Object.create(skipIds);
      var intersections = [];
      for (var i = 0; i<this.links.length; i++) {
        // avoid recursing forever
        if (skipIds[this.links[i].id]) {
          continue;
        }

        var ab = vec3.subtract(this.links[i].position, this.position, vec3.createFrom(0, 0, 0));
        var t = plane.d - vec3.dot(plane.n, this.position, vec3.createFrom(0,0,0))
        var dot = vec3.dot(plane.n, ab, vec3.createFrom(0,0,0)) ;
        t /= dot;

        if (near(t, 0) || (t > 0 && t <= 1.0) || (Math.abs(t) === Infinity && plane.position[0] === this.position[0])) {

          if (Math.abs(t) === Infinity) {
            console.log('PLANE POS', plane.position[0], this.position[0])
            intersections.push({
              position: this.position,
              a: this.id,
              b: this.links[i].id
            });
          } else {
            intersections.push({
                position: vec3.add(
                    this.position,
                    vec3.multiply(
                        vec3.createFrom(t,t,t), ab, vec3.createFrom(0,0,0)
                    ),
                    vec3.createFrom(0,0,0)
                ),
                a: this.id,
                b: this.links[i].id
            });
          }

          // Also attempt to collect any intersections on the other side of this edge
          skipIds[this.links[i].id] = true;
          skipIds[this.id] = true;
          var results = this.links[i].test(plane, skipIds);

          if (results && results.length > 0) {
            if (this.id === 548 && this.links[i].id === 546) {
              //debugger;
            }
            Array.prototype.push.apply(intersections, results);
          }

        }
      }
      return intersections;
    }
  };

  var verts = [];
  var sliceZ = 0, maxZ = 0, resolution = 0.1;
  window.setup = function(model, config) {
    resolution = config.resolution || resolution;

    for (var i = 0; i<model.length; i+=9) {
      var a = new Vertex(model[i], model[i+1], model[i+2]);
      var b = new Vertex(model[i+3], model[i+4], model[i+5]);
      var c = new Vertex(model[i+6], model[i+7], model[i+8]);

      if (a.position[2] < sliceZ) {
        sliceZ = a.position[2];
      }
      if (b.position[2] < sliceZ) {
        sliceZ = b.position[2];
      }
      if (c.position[2] < sliceZ) {
        sliceZ = c.position[2];
      }

      if (a.position[2] > maxZ) {
        maxZ = a.position[2];
      }
      if (b.position[2] > maxZ) {
        maxZ = b.position[2];
      }
      if (c.position[2] > maxZ) {
        maxZ = c.position[2];
      }

      // Setup Linkages
      a.addLink(b).addLink(c);
      b.addLink(a).addLink(c);
      c.addLink(a).addLink(b);

      verts.push(a);
      verts.push(b);
      verts.push(c);
    }

    // TODO: calculate bounding box for canvas sizing

    console.log('slicez', sliceZ);
    console.log('maxZ', maxZ);
  };

  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');

  window.tick = function() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (sliceZ > maxZ) {
      return false;
    }

    ctx.save();
    ctx.translate(300, 300)

    ctx.scale(.01,.01);
    var zPlane = {
      n : vec3.cross(
            vec3.subtract(
              vec3.createFrom(1, -6, sliceZ),
              vec3.createFrom(-4, 2, sliceZ), {}
            ),
            vec3.subtract(
              vec3.createFrom(-2, 4, sliceZ),
              vec3.createFrom(-4, 2, sliceZ), {}
            ),
            {}
          ),
      position : vec3.createFrom(0,0,sliceZ)
    };

    zPlane.d = vec3.dot(zPlane.n, vec3.createFrom(-4, 2, sliceZ));

    var collided = {}, seen = {}, intersectionGroups = [];
    for (var i = 0; i<verts.length; i++) {
      var vert = verts[i];
      if (!seen[vert.id]) {
        seen[vert.id] = true;

        var intersect = vert.test(zPlane, {});
        if (intersect && intersect.length > 0) {
          intersect.forEach(function(obj, group) {
            seen[obj.a] = true;
            seen[obj.b] = true;
          });

          intersectionGroups.push(intersect);
        }

      }
    }


    ctx.strokeStyle = "orange";
    ctx.moveTo(intersectionGroups[0][0].position[0], intersectionGroups[0][0].position[1]);

    var isLeft = function(p1, p2, p3) {
      return (p2.position[0] - p1.position[0])*(p3.position[1] - p1.position[1]) - (p3.position[0] - p1.position[0])*(p2.position[1] - p1.position[1]);
    };

    // chainHull_2D(): Andrew's monotone chain 2D convex hull algorithm
    //     Input:  P[] = an array of 2D points
    //                   presorted by increasing x- and y-coordinates
    //             n = the number of points in P[]
    //     Output: H[] = an array of the convex hull vertices (max is n)
    //     Return: the number of points in H[]
    function chainHull_2D(P)
    {
        var H = [];
        // the output array H[] will be used as the stack
        var    bot=0, top=(-1);  // indices for bottom and top of the stack
        var    i;                // array scan index
        var n = P.length;
        // Get the indices of points with min x-coord and min|max y-coord
        var minmin = 0, minmax;
        var xmin = P[0].position[0];
        for (i=1; i<n; i++)
            if (P[i].position[0] !== xmin) break;
        minmax = i-1;
        if (minmax === n-1) {       // degenerate case: all x-coords == xmin
            H[++top] = P[minmin];
            if (P[minmax].position[1] !== P[minmin].position[1]) // a nontrivial segment
                H[++top] = P[minmax];
            H[++top] = P[minmin];           // add polygon endpoint
            return H;
        }

        // Get the indices of points with max x-coord and min|max y-coord
        var maxmin, maxmax = n-1;
        var xmax = P[n-1].position[0];
        for (i=n-2; i>=0; i--)
            if (P[i].position[0] !== xmax) break;
        maxmin = i+1;

        // Compute the lower hull on the stack H
        H[++top] = P[minmin];      // push minmin point onto stack
        i = minmax;
        while (++i <= maxmin)
        {
            // the lower line joins P[minmin] with P[maxmin]
            if (isLeft( P[minmin], P[maxmin], P[i]) >= 0 && i < maxmin)
                continue;          // ignore P[i] above or on the lower line

            while (top > 0)        // there are at least 2 points on the stack
            {
                // test if P[i] is left of the line at the stack top
                if (isLeft( H[top-1], H[top], P[i]) > 0)
                    break;         // P[i] is a new hull vertex
                else
                    top--;         // pop top point off stack
            }
            H[++top] = P[i];       // push P[i] onto stack
        }

        // Next, compute the upper hull on the stack H above the bottom hull
        if (maxmax !== maxmin)      // if distinct xmax points
            H[++top] = P[maxmax];  // push maxmax point onto stack
        bot = top;                 // the bottom point of the upper hull stack
        i = maxmin;
        while (--i >= minmax)
        {
            // the upper line joins P[maxmax] with P[minmax]
            if (isLeft( P[maxmax], P[minmax], P[i]) >= 0 && i > minmax)
                continue;          // ignore P[i] below or on the upper line

            while (top > bot)    // at least 2 points on the upper stack
            {
                // test if P[i] is left of the line at the stack top
                if (isLeft( H[top-1], H[top], P[i]) > 0)
                    break;         // P[i] is a new hull vertex
                else
                    top--;         // pop top point off stack
            }
            H[++top] = P[i];       // push P[i] onto stack
        }
        if (minmax !== minmin)
            H[++top] = P[minmin];  // push joining endpoint onto stack

        return H;
    }



    intersectionGroups.forEach(function(group, groupId) {
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.strokeStyle = "white"
      // calculate the convex hull
      group.sort(function(a, b) {
        return b.position[0] - a.position[0] + b.position[1] - a.position[1];
      });


      var convexHull = chainHull_2D(group);

      convexHull.forEach(function(vert) {
        ctx.lineTo(300 + (vert.position[0] * 300), 300  + (vert.position[1] * 300));
      });

      // return to the origin
      ctx.lineTo(300 + (group[0].position[0] * 300), 300  + (group[0].position[1] * 300));
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    });

    sliceZ+=resolution;
    console.log('sliceZ', sliceZ);
    ctx.restore();
    return true;
  };
})();

// TODO: identify holes
// TODO: cleanup the skipIds nonsense




