// ---------
// Constants
// ---------

// Global canvas context
var CTX = undefined;

// Global pattern list
var PATTERNS = undefined;

// Length of each trail
var TRAIL_LENGTH = 15;

// Minimum zoom-in when everything is in one place
var MIN_SCALE = 24;

// Speed at which to change scales (percentage of scale difference per second)
var ZOOM_SPEED = 0.6

// Size of each pattern
var PATTERN_SIZE = 5;

// The fractally increasing bilayer cache
var BILAYER_CACHE = [];

// --------------------
// Onload Functionality
// --------------------

// Run when the document is loaded:
window.onload = function () {
  // Start pattern-loading process immediately
  PATTERNS = reorganize_patterns(load_patterns())

  // Grab canvas & context:
  let canvas = document.getElementById("labyrinth");
  CTX = canvas.getContext("2d");

  // Set initial canvas size & scale:
  update_canvas_size(canvas, CTX);
  set_scale(CTX, 1);
  set_destination(CTX, [0, 0]);

  // Set up trails:
  CTX.trails = [
    { "seed": 19283801, "positions": [] },
    { "seed": 74982018, "positions": [] },
    { "seed": 57319834, "positions": [] },
  ];
  for (let tr of CTX.trails) {
    for (let i = 0; i < TRAIL_LENGTH; ++i) {
      tr.positions.push([0, 0]);
    }
  }

  // Listen for window resizes but wait until 20 ms after the last consecutive
  // one to do anything.
  var timer_id = undefined;
  window.addEventListener("resize", function() {
    if (timer_id != undefined) {
      clearTimeout(timer_id);
      timer_id = undefined;
    }
    timer_id = setTimeout(
      function () {
        timer_id = undefined;
        update_canvas_size(canvas, CTX);
      },
      20 // milliseconds
    );
  });

  // Scrolling updates scale:
  document.onwheel = function(ev) {
    if (ev.preventDefault) { ev.preventDefault(); }
    handle_scroll(CTX, ev);
  }

  // Clicking sets destination:
  document.onmouseup = function (ev) {
    if (ev.preventDefault) { ev.preventDefault(); }
    handle_tap(CTX, ev);
  }
  document.ontouchend = document.onmouseup;
  // TODO: Really this?
  document.ontouchcancel = document.onmouseup;

  // Draw every frame
  window.requestAnimationFrame(draw_frame);
};

// -------------------------
// Updaters & Event Handlers
// -------------------------

function set_scale(context, scale_factor) {
  // Scale is in world-units-per-canvas-width
  context.scale = scale_factor;
}

function set_destination(context, grid_coords) {
  // Sets the current destination.
  context.destination = grid_coords;
}

function update_canvas_size(canvas, context) {
  // Updates the canvas size. Called on resize after a timeout.
  var bounds = canvas.getBoundingClientRect();
  var car = bounds.width / bounds.height;
  canvas.width = 800 * car;
  canvas.height = 800;
  context.cwidth = canvas.width;
  context.cheight = canvas.height;
  context.middle = [context.cwidth / 2, context.cheight / 2];
  context.bounds = bounds;
}

// Scrolling constants
var PIXELS_PER_LINE = 18;
var LINES_PER_PAGE = 40;

function handle_scroll(ctx, ev) {
  let unit = ev.deltaMode;
  let dy = ev.deltaY;

  // Normalize units to pixels:
  if (unit == 1) {
    dy *= PIXELS_PER_LINE;
  } else if (unit == 2) {
    dy *= PIXELS_PER_LINE * LINES_PER_PAGE;
  }

  set_scale(ctx, ctx.scale * Math.min(0.1, (100 + dy) / 100));
}

function event_pos(ctx, ev) {
  // Returns viewport position of event.
  if (ev.touches) {
    ev = ev.touches[0];
  }
  return pc__vc(ctx, [ev.clientX, ev.clientY]);
}

function handle_tap(ctx, ev) {
  let vc = event_pos(ctx, ev);
  let gc = wc__gc(ctx, cc__wc(ctx, vc__cc(ctx, vc)));
  set_destination(ctx, gc);
}

// --------------------
// Conversion functions
// --------------------

// Page <-> viewport coordinates
function pc__vc(ctx, pc) {
  return [
    (pc[0] - ctx.bounds.left) / ctx.bounds.width,
    (pc[1] - ctx.bounds.top) / ctx.bounds.height
  ];
}

function vc__pc(ctx, vc) {
  return [
    ctx.bounds.left + ctx.bounds.width * vc[0],
    ctx.bounds.top + ctx.bounds.height * vc[1],
  ];
}

// Viewport <-> canvas coordinates
function vc__cc(ctx, vc) {
  return [
    vc[0] * ctx.cwidth,
    vc[1] * ctx.cheight
  ];
}

function cc__vc(ctx, cc) {
  return [
    cc[0] / ctx.cwidth,
    cc[1] / ctx.cheight
  ];
}

// Canvas <-> world coordinates
function cc__wc(ctx, cc) {
  return [
    (cc[0]/ctx.cwidth) * ctx.scale,
    (cc[1]/ctx.cwidth) * ctx.scale // scale ignores canvas height
  ];
}

function wc__cc(ctx, wc) {
  return [
    (wc[0] / ctx.scale) * ctx.cwidth,
    (wc[1] / ctx.scale) * ctx.cwidth
  ];
}

// World <-> grid coordinates
function wc__gc(ctx, wc) {
  return [
    Math.floor(wc[0]),
    Math.floor(wc[1])
  ];
}

function gc__wc(ctx, gc) {
  return [
    gc[0] + 0.5,
    gc[1] + 0.5
  ];
}

// Pattern coordinates <-> indices
// pc is a [row, column] pair
function pc__idx(pc) {
  return pc[0] * PATTERN_SIZE + pc[1];
}

function idx__pc(idx) {
  return [
    Math.floor(idx / PATTERN_SIZE),
    idx % PATTERN_SIZE
  ];
}

// Edge + socket <-> edge ID
function ec__eid(ec) {
  return "" + ec[0] + ":" + ec[1];
}

function eid__ec(eid) {
  return [
    parseInt(eid[0]),
    parseInt(eid.slice(2))
  ]
}

// Edge + socket <-> pattern coordinates
// pc is a [row, column] pair
function ec__pc(ec) {
  if (ec[0] == 0) {
    return [ 0, ec[1]*2 ];
  } else if (ec[0] == 1) {
    return [ ec[1]*2, PATTERN_SIZE-1 ];
  } else if (ec[0] == 2) {
    return [ PATTERN_SIZE-1, ec[1]*2 ];
  } else { // ec[0] == 3, we hope
    return [ ec[1]*2, 0 ];
  }
}

// horizonal is a hint as to whether corner coordinates are on horizontal
// (top/bottom) or vertical (left/right) edges. Returns undefined if the
// pattern coordinate isn't on an edge of the specified type (but rounds
// non-socket edge coordinates to the lesser socket they're between).
function pc__ec(pc, horizonal) {
  let vertical = !horizonal;
  if (pc[0] == 0) { // top row
    if (pc[1] == 0 && vertical) { // left edge top
      return [ 3, 0 ];
    } else if (pc[1] == PATTERN_SIZE - 1 && vertical) { // right edge top
      return [ 1, 0 ];
    } else if (horizontal) { // top edge
      return [ 0, Math.floor(pc[1]/2) ];
    } else { // not on a vertical edge
      return undefined;
    }
  } else if (pc[0] == PATTERN_SIZE - 1) {
    if (pc[1] == 0 && vertical) { // left edge bottom
      return [ 3, PATTERN_SIZE - 1 ];
    } else if (pc[1] == PATTERN_SIZE - 1 && vertical) { // right edge bottom
      return [ 1, PATTERN_SIZE - 1 ];
    } else if (horizontal) { // bottom edge
      return [ 2, Math.floor(pc[1]/2) ];
    } else { // not on a vertical edge
      return undefined;
    }
  } else if (vertical) { // must be on a non-corner vertical (left or right)
    if (pc[1] == 0) {
      return [ 3, Math.floor(pc[0]/2) ];
    } else if (pc[1] == PATTERN_SIZE - 1) {
      return [ 1, Math.floor(pc[0]/2) ];
    } else { // not on a vertical edge
      return undefined;
    }
  } else { // horizontal and row is not first or last: not on an edge
    return undefined;
  }
}

// ------------
// Drawing Code
// ------------

function draw_frame(now) {
  // Draws a single frame & loops itself
  window.requestAnimationFrame(draw_frame);

  // Measure time
  let ms_time = window.performance.now();
  if (CTX.now == undefined) {
    CTX.now = ms_time;
    return; // skip this frame to get timing for the next one
  }
  CTX.elapsed = ms_time - CTX.now;
  CTX.now = ms_time;

  // TODO: let user lock-out autoadjust
  adjust_scale(CTX);
  draw_labyrinth(CTX);
}

function interest_bb(ctx) {
  result = {
    "left": ctx.destination[0],
    "right": ctx.destination[0],
    "top": ctx.destination[1],
    "bottom": ctx.destination[1]
  }
  for (let trail of ctx.trails) {
    for (let pos of trail.positions) {
      if (pos[0] < result.left) { result.left = pos[0]; }
      if (pos[0] > result.right) { result.right = pos[0]; }
      if (pos[1] < result.top) { result.top = pos[1]; }
      if (pos[1] > result.bottom) { result.bottom = pos[1]; }
    }
  }
  return result;
}

function adjust_scale(ctx) {
  // Adjusts the scaling factor according to points of interest
  let ibb = interest_bb(ctx);

  let ideal_scale = Math.max(
    MIN_SCALE,
    ibb.right - ibb.left,
    (ibb.bottom - ibb.top) * (ctx.cwidth / ctx.cheight)
  );

  let scale_diff = ideal_scale - ctx.scale;

  ctx.scale = Math.max(
    MIN_SCALE,
    ctx.scale + ZOOM_SPEED * scale_diff * (ctx.elapsed / 1000)
  );
}

function draw_labyrinth(ctx) {
  // Draws the visible portion of the labyrinth
  // TODO: HERE
}

// ---------
// Misc Code
// ---------

function lfsr(x) {
  // Implements a max-cycle-length 32-bit linear-feedback-shift-register.
  // See: https://en.wikipedia.org/wiki/Linear-feedback_shift_register
  // Note that this is NOT reversible!
  var lsb = x & 1;
  var r = x >>> 1;
  if (lsb) {
    r ^= 0x80200003; // 32, 22, 2, 1
  }
  return r;
}

function posmod(n, base) {
  // Mod operator that always returns positive results.
  return ((n % base) + base) % base;
}

// -------------------
// Fractal Coordinates
// -------------------


// Fractal <-> absolute coordinates
//
// Absolute coordinates are an [x, y] pair that denotes a grid cell on a
// standard right-handed grid where +x goes East and +y goes North. Note the
// opposite ordering from pattern coordinate [row, col] pairs.
//
// For subspecific fractal coordinates, returns the absolute coordinates of the
// center of the cell. Conversion takes time proportional to the log of the
// absolute coordinate that's more distant from the origin.
//
// Fractal coordinates consist of a height value and a list of coordinates
// indicating a trail downwards from that height. A height of 0 indicates the
// unit is an n×n region, 1 an n^2×n^2 region, and so on. Each entry in a trail
// is an index between 0 and n^2-1 that indicates which sub-cell of the current
// cell the location is within. The trail may be shorter than the height, in
// which case the fractal coordinates denote a bilayer above the base grid
// cells.

function fr__ac(fr) {
  let height = fr[0];
  let trail = fr[1];

  let cw = Math.pow(5, height); // width of a single cell
  let result = [0, 0]; // center coordinates at the top are always 0, 0.

  // Trace down through each bilayer:
  for (let i = 0; i < trail.length; ++i) {
    let pc = idx__pc(trail[i]);
    let row = pc[0];
    let col = pc[1];
    result[0] += (col - Math.floor(PATTERN_SIZE/2)) * cw;
    result[1] += (row - Math.floor(PATTERN_SIZE/2)) * cw;
    cw = cw/5;
  }

  return result;
}

function ac__fr(ac) {
  let distance = Math.max(Math.abs(ac[0]), Math.abs(ac[1]));
  // factor of two here because each n×n is centered at the origin, so only n/2
  // of it extends away from the origin.
  let height = Math.floor(Math.log(distance*2) / Math.log(PATTERN_SIZE));
  let cw = Math.pow(5, height);

  let trail = [];
  let rc = ac; // relative coordinates

  pc = [ // compute first local pattern coordinates
    Math.floor(rc[1] / cw),
    Math.floor(rc[0] / cw)
  ];

  // push first index onto trail
  trail.push(pc__idx(pc));

  for (let i = 0; i < height; ++i) { // doesn't iterate for height == 0
    rc = [ // update our relative coordinates
      posmod(rc[0], cw),
      posmod(rc[1], cw)
    ];

    // Update cell width
    cw /= 5;

    pc = [ // compute next local pattern coordinates
      Math.floor(rc[1] / cw),
      Math.floor(rc[0] / cw)
    ];

    // push index onto trail
    trail.push(pc__idx(pc));
  }

  return [height, trail];
}

function fr__edge_ac(fr, edge) {
  // Works like fr__ac, but computes the coordinates of the middle of a
  // specific edge of the given bilayer (or cell). The edge is specified using
  // a number from 0 to 3, denoting North, East, South, and West in that order.
  let ac = fr__ac(fr);

  let height = fr[0];
  let trail = fr[1];
  let edge_height = height - trail.length

  let pw = Math.pow(5, edge_height+1); // width of a pattern

  let ev; // edge vector
  if (edge == 0) { // North
    ev = [0, 1]; 
  } else if (edge == 1) { // East
    ev = [1, 0];
  } else if (edge == 2) { // South
    ev = [0, -1];
  } else { // West
    ev = [-1, 0];
  }
  return [
    ac[0] + ev[0] * pw/2,
    ac[1] + ev[1] * pw/2
  ];
}

function bilayer_seed(fr_coords) {
  // Determines the seed for the given fractal coordinate location.
  let height = fr_coords[0];
  let trail = fr_coords[1];
  let seed = 1700191983;
  for (let i = 0; i < height; ++i) {
    seed = lfsr(seed);
  }
  for (let sidx of trail) {
    seed = lfsr(seed + (seed+1)*sidx);
  }

  return seed;
}

function edge_seed(fr_coords, edge) {
  // Determines the seed for the given edge of the fractally specified bilayer.
  // Will return the same seed for both fractal + edge coordinates that
  // reference each edge (e.g., for a 5×5 pattern size, edge 3 of [0, [10]] and
  // edge 1 of [1, [11, 14]] are the same edge).
  let ec = fr__edge_ac(fr_coords, edge);
  let height = 1 + (fr_coords[0] - fr_coords[1].length);
  let seed = 75928103;
  let mix = ((seed + (17*ec[0])) ^ ec[1]) * (height + 3);
  let churn = mix % 4;
  for (let i = 0; i < churn; ++i) {
    mix = lfsr(mix + height);
  }
  return mix;
}

// ------------------
// Caching and Lookup
// ------------------

function lookup_bilayer(fr_coords) {
  // Looks up bilayer information, returning undefined until info has been
  // generated.
  if (len(BILAYER_CACHE) < fr_coords + 1) {
    // TODO: Trigger generation here!
    return undefined;
  }
  let ancestor = BILAYER_CACHE[fr_coords];
  // TODO: HERE
}

// --------------
// Labyrinth Code
// --------------

function determine_bilayer(fr_coords, superpattern) {
  // Given fractal coordinates and a defining superpattern for a bilayer,
  // creates and returns the pattern index grid for that bilayer.
  let seed = bilayer_seed(fr_coords);
  superpattern.entrance...
    // TODO: HERE
}

// ----------------------------
// Pattern Loading & Management
// ----------------------------

function load_patterns() {
  // Use with Chrome and --allow-file-access-from-files to run locally.
  var xobj = new XMLHttpRequest();
  xobj.overrideMimeType("application/json");
  var url = window.location.href;
  var path = url.substr(0, url.lastIndexOf('/'));
  var dpath = path + "patterns.json";
  var dpath = "patterns.json";

  // Load asynchronously
  xobj.open("GET", dpath);
  xobj.onload = function () {
    var successful = (
      xobj.status == 200
   || (xobj.status == 0 && dpath.startsWith("file://"))
    );
    if (!successful) {
      console.error("Failed to load patterns from:\n" + dpath)
      return undefined;
    }
    try {
      return JSON.parse(xobj.responseText);
    } catch (e) {
      console.error("JS error while loading patterns from:\n" + dpath)
      return undefined;
    }
  };
  xobj.onerror = function () {
    console.error("Request error while loading patterns from:\n" + dpath)
    return undefined;
  }
  try {
    xobj.send(null);
  } catch (e) {
    console.error("Send error while loading patterns from:\n" + dpath)
    return undefined;
  }
}

function rotate_pattern(p, r) {
  // Returns a rotated version of a pattern (specified as a SIZE*SIZE-element
  // next-list). Rotations are clockwise by 90 degrees each, up to 3.
  r = ((r % 4) + 4) % 4;
  let result = p;
  for (let i = 0; i < r; ++i) {
    result = result.map(x => pc__idx(clockwise(idx__pc(x))));
  }
  return result;
}

function clockwise(rc) {
  // Returns the 90-degree clockwise rotation of the given row, col coordinates.
  return [
    rc[1],
    (PATTERN_SIZE - 1) - rc[0]
  ];
}

function reorganize_patterns(patterns) {
  // Takes a raw patterns list and organizes it according to the entrance/exit
  // cells of each pattern. The incoming pattern list should list all patterns
  // from left-side entrances to top, right, and bottom-side exits, without
  // containing any rotations (but with reflections across the horizontal).
  // Patterns are simply lists of indices covering 0 .. N^2-1, indicating the
  // order in which cells in a square are visited.
  //
  // Entrances and exits are numbered:
  //
  //            0:0 - 0:1 - 0:2...0:N-1
  //
  //        3:0                         1:0
  //         |                           |   
  //        3:1                         1:1  
  //         |                           |   
  //        3:2                         1:2  
  //        ...                         ...  
  //        3:N-1                       1:N-1
  //
  //            2:0 - 2:1 - 2:2...2:N-1
  //
  // The return value is an object with the following keys:
  //
  //   patterns: The raw index lists, same as the input.
  //   lookup: A table mapping entrance IDs to tables mapping exit IDs to lists
  //           of pattern indices (indices in the patterns list).
  //
  let lookup = {};

  for (let pidx in patterns) {
    let p = patterns[pidx];

    // Categorize by entrance:
    let entrance = p[0];
    let npc = idx__pc(entrance);
    let nec = pc__ec(npc, false); // always hits the left edge
    let nid = ec__eid(nec);
    if (!lookup.hasOwnProperty(nid)) {
      lookup[nid] = {};
    }
    by_en = lookup[eid];

    // Within entrance object, categorize by exit:
    let exit = p[p.length-1];
    let xpc = idx__pc(exit);
    let v_xec = pc__ec(xpc, false);
    let hit = false;
    if (v_xec != undefined && v_xec[0] != 3) { // exclude U-turns
      let v_xid = ec__eid(v_xec);
      if (!by_en.hasOwnProperty(v_xid)) {
        by_en[v_xid] = [];
      }
      by_end[v_xid].push(pidx);
      hit = true;
    }
    // might (also) be interpretable as an exit on a horizontal edge
    // pushing this pattern twice is correct if both interpretations are
    // possible (for exits on the upper-right and lower-right corners).
    let h_xec = pc__ec(xpc, true);
    if (h_xec != undefined) {
      let h_xid = ec__eid(h_xec);
      if (h_xid != v_xid) {
        if (!by_end.hasOwnProperty(h_xid)) {
          by_en[h_xid] = [];
        }
        by_en[h_xid].push(pidx);
        hit = true;
      }
    }
    if (!hit) {
      console.warn("Pattern [" + pidx + "] remained uncategorized.");
    }
  }

  return {
    "patterns": patterns,
    "lookup": lookup,
  }
}
