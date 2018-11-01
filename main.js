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

// The color of the grid
var GRID_COLOR = "white";

// Size of each pattern
var PATTERN_SIZE = 5;

// The fractally increasing bilayer cache. Values in the process of being
// generated are represented by WORKING_ON_IT, while never-requested values are
// undefined.
var BILAYER_CACHE = [];

// Queue for bilayers waiting to be generated. Each entry should be a set of
// fractal coordinates. Coordinates in the queue which cannot be generated
// because the superstructure they belong to hasn't been created yet will be
// removed and discarded.
var GEN_QUEUE = [];

// Number of bilayers to generate per gen step.
var GEN_SPEED = 12;

// Delay (ms) between generation ticks
var GEN_DELAY = 5;

// All pattern entrances have this orientation
var PATTERN_ENTRANCE_ORIENTATION = 3;

// Orientations
var NORTH = 0;
var EAST = 1;
var SOUTH = 2;
var WEST = 3;

// Which frame we're on:
var FRAME = 0;

// When the frame counter resets:
var MAX_FC = 1000;
// var MAX_FC = 10000000;

// Object placeholder for things we're in the process of generating:
var WORKING_ON_IT = {};

// Whether to double-check generation integrity or to assume things work
// correctly.
var CHECK_GEN_INTEGRITY = true;

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

  set_scale(ctx, ctx.scale * Math.max(0.1, (100 + dy) / 100));
}

function event_pos(ctx, ev) {
  // Returns viewport position of event.
  if (ev.touches) {
    ev = ev.touches[0];
  }
  return pgc__vc(ctx, [ev.clientX, ev.clientY]);
}

function handle_tap(ctx, ev) {
  let vc = event_pos(ctx, ev);
  let gc = wc__gc(cc__wc(ctx, vc__cc(ctx, vc)));
  set_destination(ctx, gc);
}

// --------------------
// Conversion functions
// --------------------

// Page <-> viewport coordinates
function pgc__vc(ctx, pc) {
  return [
    (pc[0] - ctx.bounds.left) / ctx.bounds.width,
    (pc[1] - ctx.bounds.top) / ctx.bounds.height
  ];
}

function vc__pgc(ctx, vc) {
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
    ((cc[0] - ctx.cwidth/2)/ctx.cwidth) * ctx.scale,
    ((cc[1] - ctx.cheight/2)/ctx.cwidth) * ctx.scale // scale ignores height
  ];
}

function wc__cc(ctx, wc) {
  return [
    (wc[0] / ctx.scale) * ctx.cwidth + ctx.cwidth/2,
    (wc[1] / ctx.scale) * ctx.cwidth + ctx.cheight/2
  ];
}

function canvas_unit(ctx) {
  // Returns the length of one world-coordinate unit in canvas coordinates.
  return wc__cc(ctx, [1, 0])[0] - ctx.cwidth/2;
}

// World <-> grid coordinates
function wc__gc(wc) {
  return [
    Math.floor(wc[0]),
    Math.floor(wc[1])
  ];
}

function gc__wc(gc) {
  return [
    gc[0] + 0.5,
    gc[1] + 0.5
  ];
}

// Page coordinates all the way to grid coordinates:
function pgc__gc(ctx, pgc) {
  return wc__gc(
    cc__wc(
      ctx,
      vc__cc(
        ctx,
        pgc__vc(ctx, pgc)
      )
    )
  );
}

// Gets extrema of canvas in the grid. Returns an object with keys 'NW', 'NE',
// 'SW', and 'SE' for each of the four corners.
function grid_extrema(ctx) {
  return {
    'NW': pgc__gc(ctx, [ ctx.bounds.left, ctx.bounds.top ]),
    'NE': pgc__gc(ctx, [ ctx.bounds.right, ctx.bounds.top ]),
    'SW': pgc__gc(ctx, [ ctx.bounds.left, ctx.bounds.bottom ]),
    'SE': pgc__gc(ctx, [ ctx.bounds.right, ctx.bounds.bottom ]),
  };
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
// Undefined socket value indicates unconstrained socket
function ec__eid(ec) {
  if (ec[1] == undefined) {
    return "" + ec[0] + ":A"
  } else {
    return "" + ec[0] + ":" + ec[1];
  }
}

function eid__ec(eid) {
  let ori = parseInt(eid[0]);
  let slot = parseInt(eid.slice(2));
  if (isNaN(slot)) {
    return [ ori, undefined ];
  } else {
    return [ ori, slot ];
  }
}

// (Possibly-)Nonspecific edge coordinate to (possible-singular) list of EIDs.
function ec__eids(ec) {
  let result = [];
  if (ec[1] != undefined) {
    result.push(ec__eid(ec));
  } else {
    for (let i = 0; i <= Math.floor(PATTERN_SIZE/2); ++i) {
      result.push(ec__eid([ec[0], i]));
    }
  }
  return result;
}

// Edge + socket <-> pattern coordinates
// pc is a [row, column] pair
function ec__pc(ec) {
  if (ec[1] == undefined) {
    console.warn(
      "Attempted to translate an underspecified edge coordiante into a "
    + "pattern coordinate."
    );
    return undefined;
  } else if (ec[0] == 0) {
    return [ 0, ec[1]*2 ];
  } else if (ec[0] == 1) {
    return [ ec[1]*2, PATTERN_SIZE-1 ];
  } else if (ec[0] == 2) {
    return [ PATTERN_SIZE-1, ec[1]*2 ];
  } else { // ec[0] == 3, we hope
    return [ ec[1]*2, 0 ];
  }
}

// horizontal is a hint as to whether corner coordinates are on horizontal
// (top/bottom) or vertical (left/right) edges. Returns undefined if the
// pattern coordinate isn't on an edge of the specified type (but rounds
// non-socket edge coordinates to the lesser socket they're between).
function pc__ec(pc, horizontal) {
  let vertical = !horizontal;
  if (pc[0] == 0) { // top row
    if (pc[1] == 0 && vertical) { // left edge top
      return [ WEST, 0 ];
    } else if (pc[1] == PATTERN_SIZE - 1 && vertical) { // right edge top
      return [ EAST, 0 ];
    } else if (horizontal) { // top edge
      return [ NORTH, Math.floor(pc[1]/2) ];
    } else { // not on a vertical edge
      return undefined;
    }
  } else if (pc[0] == PATTERN_SIZE - 1) {
    if (pc[1] == 0 && vertical) { // left edge bottom
      return [ WEST, Math.floor((PATTERN_SIZE - 1)/2) ];
    } else if (pc[1] == PATTERN_SIZE - 1 && vertical) { // right edge bottom
      return [ EAST, Math.floor((PATTERN_SIZE - 1)/2) ];
    } else if (horizontal) { // bottom edge
      return [ SOUTH, Math.floor(pc[1]/2) ];
    } else { // not on a vertical edge
      return undefined;
    }
  } else if (vertical) { // must be on a non-corner vertical (left or right)
    if (pc[1] == 0) {
      return [ WEST, Math.floor(pc[0]/2) ];
    } else if (pc[1] == PATTERN_SIZE - 1) {
      return [ EAST, Math.floor(pc[0]/2) ];
    } else { // not on a vertical edge
      return undefined;
    }
  } else { // horizontal and row is not first or last: not on an edge
    return undefined;
  }
}

function nbs__ori(pr, pc) {
  // Takes previous pattern coordinates and current pattern coordinates of two
  // neighboring cells, and returns the orientation of the current cell (which
  // edge of the current cell borders that neighbor).
  if (pr[0] == pc[0] - 1) {
    return NORTH;
  } else if (pr[0] == pc[0] + 1) {
    return SOUTH;
  } else if (pr[1] == pc[1] + 1) {
    return EAST;
  } else {
    return WEST;
  }
}

function ori__nb(pc, ori) {
  // Takes a pair of (row, col) pattern coordinates and an orientation and
  // returns the pattern coordinates of the cell in the indicated direction.
  if (ori == NORTH) {
    return [ pc[0] - 1, pc[1] ];
  } else if (ori == EAST) {
    return [ pc[0], pc[1] + 1 ];
  } else if (ori == SOUTH) {
    return [ pc[0] + 1, pc[1] ];
  } else if (ori == WEST) {
    return [ pc[0], pc[1] - 1 ];
  } else {
    console.error("Bad orientation: " + ori);
  }
}

function ori__vec(ori) {
  // Converts an orientation into an [x, y] direction vector.
  if (ori == NORTH) {
    return [0, -1];
  } else if (ori == EAST) {
    return [1, 0];
  } else if (ori == SOUTH) {
    return [0, 1];
  } else if (ori == WEST) {
    return [-1, 0];
  } else {
    console.error("Bad orientation: " + ori);
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

  // Count frames
  FRAME += 1;
  FRAME %= MAX_FC;

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

function orientation_at(fc) {
  // Returns the orientation of the cell at the given fractal coordinates, or
  // undefined if sufficient information has not yet been cached. Requests the
  // generation of new bilayers as appropriate because it uses lookup_bilayer.

  let height = fc[0];
  let trace = fc[1];
  let bilayer = lookup_bilayer([height, trace.slice(0, trace.length - 1)]);

  // Our trace and pattern index:
  let pidx = trace[trace.length - 1];

  if (bilayer == undefined) { // not available yet; has been requested
    return undefined;
  }

  // Look up cell orientation:
  let lidx = PATTERNS.indices[bilayer.pattern][pidx];
  return PATTERNS.orientations[bilayer.pattern][lidx];
}

function draw_labyrinth(ctx) {
  // Draws the visible portion of the labyrinth

  // Clear the canvas:
  // TODO: Draw a background rectangle to get color here?
  ctx.clearRect(0, 0, ctx.cwidth, ctx.cheight);

  // Set stroke color:
  ctx.strokeStyle = GRID_COLOR;

  // Radius of each grid cell
  let cell_size = canvas_unit(ctx);

  // Iterate over visible (and a few invisible) cells at the base layer:
  let extrema = grid_extrema(ctx);
  for (let x = extrema['NW'][0] - 1; x <= extrema['NE'][0] + 1; ++x) {
    for (let y = extrema['NW'][1] - 1; y <= extrema['SW'][1] + 1; ++y) {
      // Canvas coordinates for this grid cell:
      let cc = wc__cc(ctx, gc__wc([ x, y ]));

      // Draw a from-link for each cell
      let fc = ac__fc([x, y]);
      let ori = orientation_at(fc);

      if (ori == undefined) { // not available yet; has been requested
        // Just draw a circle
        ctx.beginPath();
        ctx.arc(cc[0], cc[1], cell_size*0.2, 0, 2*Math.PI);
        ctx.stroke();

      } else { // Draw a from-link

        // Neighbor in that direction & canvas coords for that neighbor:
        let vec = ori__vec(ori);
        let st_cc = [
          cc[0] + vec[0] * cell_size,
          cc[1] + vec[1] * cell_size
        ];

        // Draw a simple line:
        ctx.beginPath();
        ctx.moveTo(st_cc[0], st_cc[1]);
        ctx.lineTo(cc[0], cc[1]);
        // TODO: DEBUG
        // TODO: HERE
        ctx.strokeText(
          "" + [x, y] + ":" + fc[1][fc[1].length - 1],
          cc[0],
          cc[1]
        );
        ctx.stroke();
      }
    }
  }

  // Done.
  // TODO: Draw trails!
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

function randint(up_to, seed) {
  // Picks a random integer strictly less than the given value using the given
  // seed.
  // TODO: Does this need work?
  return posmod(seed, up_to);
}

function choose_randomly(possibilities, seed) {
  // Picks randomly from a list using the given seed.
  // TODO: Does this need work?
  let idx = posmod(seed, possibilities.length);
  return possibilities[idx];
}

function random_socket(seed) {
  // Picks a random edge socket using the given seed.
  // TODO: Does this need improvement?
  return posmod(seed, Math.floor(PATTERN_SIZE/2));
}

function random_universal_socket(seed) {
  // Picks a random socket that's a universal connector, meaning it doesn't put
  // any constraints on the other entrance/exit socket of a cell it's added to.
  // TODO: Does this need improvement?
  let range = Math.floor(PATTERN_SIZE/2) - 2;
  if (range > 0) {
    return 1 + posmod(seed, range);
  } else {
    return 1;
  }
}

function posmod(n, base) {
  // Mod operator that always returns positive results.
  return ((n % base) + base) % base;
}

function rotations_between(st, ed) {
  // Takes starting and ending orientations and returns the number of clockwise
  // rotations from the start to the end.
  return ((ed - st) + 4) % 4;
}

function absolute_orientation(oriA, oriB) {
  // Returns the absolute orientation when something with orientation B is
  // embedded in something with orientation A.
  return (oriA + oriB) % 4;
}

function opposite_side(ori) {
  // Takes an orientation and returns the orientation of the opposite side.
  return (ori + 2) % 4;
}

function opposite_rotation(rot) {
  // Takes a clockwise rotation value and returns the number of clockwise
  // rotations required to get back to the original orientation from the final
  // orientation.
  return (4 - rot) % 4;
}

function flip_socket(socket) {
  // Returns the flipped socket index for a socket that's counted backwards
  // from its match.
  return Math.floor(PATTERN_SIZE/2) - socket;
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
// indicating a trace downwards from that height. A height of 0 indicates the
// unit is an n×n region, 1 an n^2×n^2 region, and so on. Each entry in a trace
// is an index between 0 and n^2-1 that indicates which sub-cell of the current
// cell the location is within. The trace may be shorter than the height, in
// which case the fractal coordinates denote a bilayer above the base grid
// cells.

function fc__ac(fc) {
  let height = fc[0];
  let trace = fc[1];

  let cw = Math.pow(5, height); // width of a single cell
  let result = [0, 0]; // center coordinates at the top are always 0, 0.

  // Trace down through each bilayer:
  for (let i = 0; i < trace.length; ++i) {
    let pc = idx__pc(trace[i]);
    let row = pc[0];
    let col = pc[1];
    result[0] += (col - Math.floor(PATTERN_SIZE/2)) * cw;
    result[1] += (row - Math.floor(PATTERN_SIZE/2)) * cw;
    cw = cw/5;
  }

  return result;
}

function ac__fc(ac) {
  let distance = Math.max(Math.abs(ac[0]), Math.abs(ac[1]));
  // special case for the origin:
  if (distance == 0) {
    return [ 0, [ 12 ] ];
  }
  // factor of two here because each n×n is centered at the origin, so only n/2
  // of it extends away from the origin.
  let height = Math.floor(Math.log(distance*2) / Math.log(PATTERN_SIZE));
  let cw = Math.pow(5, height);

  let trace = [];
  let rc = [
    ac[0] + cw * PATTERN_SIZE/2,
    ac[1] + cw * PATTERN_SIZE/2
  ]; // relative coordinates

  pc = [ // compute first local pattern coordinates
    Math.floor(rc[1] / cw), // row from y
    Math.floor(rc[0] / cw)  // col from x
  ];

  // push first index onto trace
  trace.push(pc__idx(pc));

  for (let i = 0; i < height; ++i) { // doesn't iterate for height == 0
    rc = [ // update our relative coordinates
      posmod(rc[0], cw),
      posmod(rc[1], cw)
    ];

    // Update cell width
    cw /= 5;

    pc = [ // compute next local pattern coordinates
      Math.floor(rc[1] / cw), // row from y
      Math.floor(rc[0] / cw) // col from x
    ];

    // push index onto trace
    trace.push(pc__idx(pc));
  }

  return [height, trace];
}

function fc__edge_ac(fc, edge) {
  // Works like fc__ac, but computes the coordinates of the middle of a
  // specific edge of the given bilayer (or cell). The edge is specified using
  // a number from 0 to 3, denoting North, East, South, and West in that order.
  let ac = fc__ac(fc);

  let height = fc[0];
  let trace = fc[1];
  let edge_height = height - trace.length

  let pw = Math.pow(5, edge_height+1); // width of a pattern

  let ev = ori__vec(edge); // edge vector
  return [
    ac[0] + ev[0] * pw/2,
    ac[1] + ev[1] * pw/2
  ];
}

function extend_fc(fc) {
  // Extends the given fractal coordinates so that their height is increased by
  // one while still denoting the same cell.
  let height = fc[0];
  let trace = fc[1];
  let center = Math.floor((PATTERN_SIZE * PATTERN_SIZE) / 2);
  return [
    height + 1,
    [ center ].concat(trace)
  ];
}

function bilayer_seed(fr_coords) {
  // Determines the seed for the given fractal coordinate location.
  let height = fr_coords[0];
  let trace = fr_coords[1];
  let seed = 1700191983;
  for (let i = 0; i < height; ++i) {
    seed = lfsr(seed);
  }
  for (let sidx of trace) {
    seed = lfsr(seed + (seed+1)*sidx);
  }

  return seed;
}

function edge_seed(fr_coords, edge) {
  // Determines the seed for the given edge of the fractally specified bilayer.
  // Will return the same seed for both fractal + edge coordinates that
  // reference each edge (e.g., for a 5×5 pattern size, the West (#3) edge of
  // [0, [10]] and the East (#1) edge of [1, [11, 14]] are the same edge).
  let ec = fc__edge_ac(fr_coords, edge);
  let height = 1 + (fr_coords[0] - fr_coords[1].length);
  let seed = 75928103;
  let mix = ((seed + (17*ec[0])) ^ ec[1]) + 3*height;
  let churn = mix % 4;
  for (let i = 0; i < churn; ++i) {
    mix = lfsr(mix + height);
  }
  return mix;
}

function central_coords(height) {
  // Returns the fractal coordinates for the central bilayer just below the
  // given height (or just the central grid cell for height=0).
  let center = Math.floor((PATTERN_SIZE * PATTERN_SIZE) / 2);
  return [ height, [ center ] ];
}

// ------------------
// Caching and Lookup
// ------------------

function request_central_bilayer() {
  if (BILAYER_CACHE[BILAYER_CACHE.length - 1] == WORKING_ON_IT) {
    // We're already working on the next central bilayer
    return;
  }
  let height = BILAYER_CACHE.length;
  BILAYER_CACHE[height] = WORKING_ON_IT;
  let fr_coords = central_coords(height);
  GEN_QUEUE.push(fr_coords);
}

function lookup_bilayer(fr_coords) {
  // Looks up the cached bilayer at the given fractal coordinates, or returns
  // undefined and adds an entry to the generation queue if that bilayer or one
  // of its parents is not yet cached.
  let height = fr_coords[0];
  let trace = fr_coords[1];

  if (BILAYER_CACHE.length < height + 1) {
    request_central_bilayer();
    return undefined;
  }
  let ancestor = BILAYER_CACHE[height];
  if (ancestor == WORKING_ON_IT) {
    return undefined;
  }
  let sofar = [];
  for (let idx of trace) {
    sofar.push(idx);
    if (ancestor.children[idx] == WORKING_ON_IT) {
      // we're already working on it
      return undefined;
    } else if (ancestor.children[idx] == undefined) {
      // add this to our generation queue
      ancestor.children[idx] = WORKING_ON_IT;
      GEN_QUEUE.push([ height, sofar ]);
      return undefined;
    } else {
      // inwards; onwards
      ancestor = ancestor.children[idx];
    }
  }
  // we've found it!
  return ancestor;
}

function gen_step() {
  // Self-queuing function that processes the generation queue.
  if (PATTERNS != undefined) {
    // skip if we haven't loaded patterns yet
    for (let i = 0; i < GEN_SPEED; ++i) {
      gen_next();
    }
  }
  window.setTimeout(gen_step, GEN_DELAY);
}


function gen_next() {
  // Generates the next bilayer in the generation queue, first generating a
  // single extra level of the bilayer cache if at least one more has been
  // requested.
  if (BILAYER_CACHE[BILAYER_CACHE.length - 1] == WORKING_ON_IT) {
    let above;
    if (BILAYER_CACHE.length > 1) {
      above = gen_central_bilayer(
        BILAYER_CACHE.length - 1,
        BILAYER_CACHE[BILAYER_CACHE.length - 2]
      ); // must embed this @ center
    } else {
      above = gen_central_bilayer(BILAYER_CACHE.length - 1, null);
      // no constraint
    }
    BILAYER_CACHE[BILAYER_CACHE.length - 1] = above;
  }
  let next = GEN_QUEUE.shift();
  if (next == undefined) {
    return; // nothing to do right now
  }
  let height = next[0];
  let trace = next[1];
  // Pop last entry in trace (points to bilayer we're being asked to generate)
  // and keep the rest to find our parent:
  let last = trace.pop();
  let parent = lookup_bilayer([height, trace]);
  if (
    parent != WORKING_ON_IT
 && parent != undefined
 && parent.children != null
 && parent.children[last] == WORKING_ON_IT
  ) {
    parent.children[last] = gen_bilayer([height, trace], parent, last);
  }
}


// --------------
// Labyrinth Code
// --------------

function gen_central_bilayer(height, child_bilayer) {
  // Using the given height and child bilayer, generates and returns the
  // central bilayer, at the given height.

  // Compute the seed
  let fc = central_coords(height);
  let seed = bilayer_seed(fc);

  // Assemble empty result:
  result = {
   "coords": fc,
   "seed": seed,
   "pattern": undefined,
   "sub_patterns": [],
   "children": []
  };

  // Extract & embed child pattern, and pick a compatible superpattern
  if (child_bilayer != null) {
    // Figure out how our center cell must be oriented given our child bilayer:
    let constraint = child_bilayer.pattern;
    let c_nec = PATTERNS.entrances[constraint];
    let c_nori = c_nec[0];
    let c_xec = PATTERNS.exits[constraint];
    let c_xori = c_xec[0];

    // Compute possibilities and pick a pattern:
    let poss = central_possibilities(c_nori, c_xori);
    result.pattern = choose_randomly(poss, lfsr(seed + 61987291));

    // Embed our child pattern:
    let center = Math.floor((PATTERN_SIZE * PATTERN_SIZE) / 2);
    result.sub_patterns[center] = constraint;

    // Isolate that central pattern:
    isolate_center_pattern(result);
  } else { // No child, so we're at the base layer
    result.sub_patterns = null; // there are no sub-patterns
    result.children = null; // there are no children

    // Pick random entrance/exit orientations:
    let nori = randint(4, lfsr(seed + 75981238));
    let xori = randint(4, lfsr(seed + 3127948));

    // Pattern chosen so that its entrance and exit will have the appropriate
    // edge sockets for their neighbors.
    let n_socket = random_socket(edge_seed(fc, nori));
    let x_socket = random_socket(edge_seed(fc, xori));
    let poss = pattern_possibilities([nori, n_socket], [xori, x_socket]);
    result.pattern = choose_randomly(poss, lfsr(seed + 817293891));
  }

  // Only set sub-patterns if we're above the bottom layer:
  if (result.sub_patterns != null) {

    // Set edge patterns:
    set_edge_patterns(result);

    // Fill remaining patterns:
    fill_patterns(result);
  }

  return result;
}

function gen_bilayer(parent_fc, parent_bilayer, index) {
 // Generates a non-central bilayer given the fractal coordinates of its
 // parent, its parent bilayer, and its pattern index within that parent.

 // Re-assemble full trace:
 let height = parent_fc[0];
 let ptrace = parent_fc[1];
 let trace = ptrace.slice();
 trace.push(index);
 let fc = [height, trace];

 // Compute the seed
 let seed = bilayer_seed(fc);

 // Look up the pattern index in our parent:
 let pattern = parent_bilayer.sub_patterns[index];
 if (pattern == undefined) {
   console.log(parent_bilayer);
 }
 
 // Create result
 result = {
   "coords": fc,
   "seed": seed,
   "pattern": pattern,
   "sub_patterns": [],
   "children": []
 };

  // Set edge patterns:
  set_edge_patterns(result);

  // Fill remaining patterns:
  fill_patterns(result);

  if (CHECK_GEN_INTEGRITY) {
    if (result.pattern != parent_bilayer.sub_patterns[index]) {
      console.error("Super/sub pattern index mismatch.");
    }
    for (let i = 0; i < PATTERN_SIZE * PATTERN_SIZE; ++i) {
      if (result.sub_patterns[i] == undefined) {
        console.error("Undefined sub_pattern after fill_patterns.");
      }
    }
  }

  return result;
}

function isolate_center_pattern(bilayer) {
  // Given a bilayer with a fixed central pattern, adds sub-patterns on either
  // side of the central pattern that isolate it from the rest of the
  // sub-patterns in the bilayer.
  if (bilayer.pattern == undefined) {
    console.error("Undefined bilayer pattern in isolate_center_pattern.");
  }
  let seed = lfsr(bilayer.seed + 57239842);
  let center = Math.floor((PATTERN_SIZE * PATTERN_SIZE) / 2);
  let cidx = PATTERNS.indices[bilayer.pattern][center];
  let next = cidx + 1;
  let prev = cidx - 1;
  let positions = PATTERNS.positions[bilayer.pattern];
  let nx_idx = positions[next];
  let pr_idx = positions[prev];

  // The constraining sub-pattern:
  let constraint = bilayer.sub_patterns[center];

  // That pattern's entrance and exit:
  let nec = PATTERNS.entrances[constraint];
  let xec = PATTERNS.exits[constraint];
  // TODO: DEBUG
  /*
  let c_nori = PATTERNS.orientations[bilayer.pattern][cidx];
  let c_xori = opposite_side(PATTERNS.orientations[bilayer.pattern][next]);
  if (c_nori != nec[0] || c_xori != xec[0]) {
    console.error("Super/sub-pattern orientation mismatch.");
  }
  */

  // The partner edge coordinates for those:
  let pr_xec = [ opposite_side(nec[0]), nec[1] ];
  let nx_nec = [ opposite_side(xec[0]), xec[1] ];

  // Orientations for entrance to previous and exit from next:
  let pr_nori = PATTERNS.orientations[bilayer.pattern][prev];
  let nx_xori = opposite_side(PATTERNS.orientations[bilayer.pattern][next+1]);

  // Pick valve sockets
  let pr_valve = random_universal_socket(seed);
  seed = lfsr(seed);
  let nx_valve = random_universal_socket(seed);
  seed = lfsr(seed);

  let poss = pattern_possibilities([pr_nori, pr_valve], pr_xec);
  bilayer.sub_patterns[pr_idx] = choose_randomly(poss, seed);
  seed = lfsr(seed);

  poss = pattern_possibilities(nx_nec, [nx_xori, nx_valve]);
  bilayer.sub_patterns[nx_idx] = choose_randomly(poss, seed);
}

function set_edge_patterns(bilayer) {
  // Given a bilayer that already has a superpattern, picks edge entrance/exit
  // sub-sockets and sets edge sub-patterns accordingly.

  let seed = lfsr(bilayer.seed + 1029801823);
  let coords = bilayer.coords;

  let superpattern = PATTERNS.positions[bilayer.pattern];
  if (superpattern == undefined) {
    console.log(bilayer);
  }
  let last = superpattern.length - 1;
  let nec = PATTERNS.entrances[bilayer.pattern];
  let xec = PATTERNS.exits[bilayer.pattern];

  // Pick edge sockets based on edge seeds (our partners' picks will match):
  let n_socket = random_socket(edge_seed(coords, nec[0]));
  let x_socket = random_socket(edge_seed(coords, xec[0]));

  // The start and end sub-patterns that we will determine, and the
  // orientations of their non-edge-facing sides:
  let st = superpattern[0];
  let st_xori = opposite_side(PATTERNS.orientations[bilayer.pattern][1]);
  let ed = superpattern[last];
  let ed_nori = PATTERNS.orientations[bilayer.pattern][last];

  // Observe or pick start valve socket:
  let st_next = superpattern[1];
  let st_valve = undefined;
  if (bilayer.sub_patterns == null) {
    st_valve = random_universal_socket(seed);
    seed = lfsr(seed);
  } else {
    let sub_next = bilayer.sub_patterns[st_next];
    if (sub_next != undefined && sub_next != WORKING_ON_IT) {
      st_valve = PATTERNS.entrances[sub_next][1];
    } else {
      st_valve = random_universal_socket(seed);
      seed = lfsr(seed);
    }
  }

  // Observe or pick end valve socket:
  let ed_prev = superpattern[last - 1];
  let ed_valve = undefined;
  if (bilayer.sub_patterns == null) {
    ed_valve = random_universal_socket(seed);
    seed = lfsr(seed);
  } else {
    let sub_prev = bilayer.sub_patterns[ed_prev];
    if (sub_prev != undefined && sub_prev != WORKING_ON_IT) {
      ed_valve = PATTERNS.exits[sub_prev][1];
    } else {
      ed_valve = random_universal_socket(seed);
      seed = lfsr(seed);
    }
  }

  // Pick a start sub-pattern given the constraints we've chosen:
  let poss = pattern_possibilities([nec[0], n_socket], [st_xori, st_valve]);
  bilayer.sub_patterns[st] = choose_randomly(poss, seed);
  seed = lfsr(seed);

  // Pick an end sub-pattern given the constraints we've chosen:
  poss = pattern_possibilities([ed_nori, ed_valve], [xec[0], x_socket]);
  bilayer.sub_patterns[ed] = choose_randomly(poss, seed);
}

function fill_patterns(bilayer) {
  // Given a bilayer that already knows its superpattern, iteratively fills in
  // any unconstrained sub-patterns that remain. Entrances and exits must be
  // filled in first!
  let superpattern = PATTERNS.positions[bilayer.pattern];
  let seed = lfsr(bilayer.seed + 5786297813);
  // Doesn't touch entrance or exit
  for (let i = 1; i < superpattern.length-1; ++i) {
    let idx = superpattern[i];
    let pc = idx__pc(idx);
    if (bilayer.sub_patterns[idx] == undefined) {
      // get prev + next indices
      let prev = superpattern[i-1];
      let next = superpattern[i+1];

      // compute entrance/exit orientations
      let prpc = idx__pc(prev);
      let nori = nbs__ori(prpc, pc);
      let nxpc = idx__pc(next);
      let xori = opposite_side(nbs__ori(pc, nxpc));

      // pick entrance/exit sockets
      let pxs = undefined; // previous exit socket
      let ppat = bilayer.sub_patterns[prev];
      if (ppat != undefined && ppat != WORKING_ON_IT) {
        let pxs = PATTERNS.exits[ppat][1]; // just the socket
      }

      let nns = undefined; // next entrance socket
      let npat = bilayer.sub_patterns[next];
      if (npat != undefined && npat != WORKING_ON_IT) {
        nns = PATTERNS.entrances[npat][1]; // just the socket
      }

      // Patterns that fit:
      let poss = pattern_possibilities([nori, pxs], [xori, nns]);

      // Pick a random pattern that fits:
      bilayer.sub_patterns[idx] = choose_randomly(poss, seed);
      if (bilayer.sub_patterns[idx] == undefined) {
        console.error("Pick fail.");
      }
      seed = lfsr(seed);
    }
  }

  // TODO: DEBUG
  if (CHECK_GEN_INTEGRITY) {
    for (let i = 0; i < superpattern.length; ++i) {
      let lidx = PATTERNS.indices[bilayer.pattern][i];
      let ori = PATTERNS.orientations[bilayer.pattern][lidx];
      if (lidx > 0) {
        let pr_pidx = superpattern[lidx - 1];
        let vec = ori__vec(ori);
        let pc = idx__pc(i);
        let pr_pc = [pc[0] + vec[1], pc[1] + vec[0]];
        if (pr_pidx != pc__idx(pr_pc)) {
          console.error(
            ["Filled pattern ORI mismatch", lidx, pr_pidx, ori, vec, pc, pr_pc]
          );
        }
        if (PATTERNS.entrances[bilayer.sub_patterns[i]][0] != ori) {
          console.error("Subpatern entrance/ORI mismatch");
        }
        if (lidx < superpattern.length - 1) {
          let next_ori = PATTERNS.orientations[bilayer.pattern][lidx+1];
          let exit = PATTERNS.exits[bilayer.sub_patterns[i]][0];
          if (exit != opposite_side(next_ori)) {
            console.error("Subpattern exit/ORI mismatch");
          }
        }
      }
    }
  }
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
      receive_patterns(JSON.parse(xobj.responseText));
    } catch (e) {
      console.error("JS error while loading patterns from:\n" + dpath)
      console.log(e);
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

function receive_patterns(base_patterns) {
  // Receives loaded pattern data and reorganize it into thef form required.
  PATTERNS = reorganize_patterns(base_patterns);
}

function rotate_pattern(p, r) {
  // Returns a rotated version of a pattern (specified as a SIZE*SIZE-element
  // ordered-index list). Rotations are clockwise by 90 degrees each, up to 3.
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

function rotate_ec(ec, rot) {
  let ori = ec[0];
  let socket = ec[1];
  let rori = absolute_orientation(ori, rot);
  if (ori % 2 == 0) {
    if (rot > 1) {
      socket = flip_socket(socket);
    }
  } else {
    if (rot == 1 || rot == 2) {
      socket = flip_socket(socket);
    }
  }
  return [ rori, socket ];
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
  //   positions: Arrays that map from linear index to pattern index, same as
  //              the input, but with some duplications where patterns with
  //              corner exits can be interpreted as having exits on different
  //              sides, and to account for all four possible rotations of each
  //              pattern.
  //   indices: Arrays that map from pattern index to linear index, the inverse
  //            of the input.
  //   orientations: Arrays that map from linear index to cell orientation
  //                 (which edge borders the previous cell).
  //   entrances: An array storing the entrance socket for each pattern.
  //   exits: An array storing the exit orientation and socket for each pattern.
  //   lookup: A table mapping entrance IDs to tables mapping exit IDs to lists
  //           of pattern indices (indices in the patterns list).


  // Empty result:
  let result = {
    "positions": [],
    "indices": [],
    "orientations": [],
    "entrances": [],
    "exits": [],
    "lookup": {},
  }

  for (let pidx in patterns) {
    let p = patterns[pidx];

    // Categorize by entrance:
    let entrance = p[0];
    let npc = idx__pc(entrance);
    let nec = pc__ec(npc, false); // always hits the West edge
    let nid = ec__eid(nec);

    // Within entrance object, categorize by exit:
    let exit = p[p.length-1];
    let xpc = idx__pc(exit);
    let v_xec = pc__ec(xpc, false);
    let v_xid = undefined;
    let hit = false;
    if (v_xec != undefined && v_xec[0] != PATTERN_ENTRANCE_ORIENTATION) {
      // exclude U-turns
      v_xid = ec__eid(v_xec);
      // Register this pattern and its rotations.
      register_pattern(result, nec, v_xec, p);
      hit = true;
    }
    // might (also) be interpretable as an exit on a horizontal edge
    // pushing this pattern twice is correct if both interpretations are
    // possible (for exits on the upper-right and lower-right corners).
    let h_xec = pc__ec(xpc, true);
    if (h_xec != undefined) {
      let h_xid = ec__eid(h_xec);
      if (h_xid != v_xid) {
        register_pattern(result, nec, h_xec, p);
        hit = true;
      }
    }
    if (!hit) {
      console.warn("Pattern [" + pidx + "] remained uncategorized.");
    }
  }

  return result;
}

function register_pattern(
  registry,
  nec,
  xec,
  pattern
) {
  // Takes a registry, an entrance coordinate, an exit coordinate, and a
  // pattern, and registers a new pattern, including all four possible
  // orientations of that pattern (does not deal with exit ambiguity).
  for (rot = 0; rot < 4; ++rot) {
    // All four possible rotations

    // this will be the pattern index of the newly-registered pattern
    let pidx = registry.positions.length;

    // Create rotated pattern and push onto our positions list:
    let rp = rotate_pattern(pattern, rot);
    registry.positions.push(rp);

    // Rotated entrance and exit coordinates:
    let rnec = rotate_ec(nec, rot);
    let rxec = rotate_ec(xec, rot);
    registry.entrances.push(rnec);
    registry.exits.push(rxec);

    // Construct inverse pattern
    let antipattern = [];
    for (let i = 0; i < rp.length; ++i) {
      let idx = rp[i];
      antipattern[idx] = i;
    }
    registry.indices.push(antipattern);

    // Construct orientations pattern
    registry.orientations.push(pattern_orientations(rp, rnec[0]));

    // Add this pattern to the lookup table:
    let nid = ec__eid(rnec);
    let xid = ec__eid(rxec);
    if (!registry.lookup.hasOwnProperty(nid)) {
      registry.lookup[nid] = {};
    }
    let by_en = registry.lookup[nid];
    if (!by_en.hasOwnProperty(xid)) {
      by_en[xid] = [];
    }
    let lu = by_en[xid];
    lu.push(pidx);
  }
}

function pattern_possibilities(nc, xc) {
  // Takes entrance and exit coordinates and returns a list of the indices of
  // all patterns that have that entrance and that exit. Coordinates may be
  // underspecified, in which case the list of all possible patterns that match
  // all constraints given is returned.
  let n_specific = nc[1] != undefined;
  let x_specific = xc[1] != undefined;

  if (nc[0] == xc[0]) {
    console.error("Same side entrance/exit in pattern_possibilities.");
  }

  let nid = ec__eid(nc);
  let xid = ec__eid(xc);

  // Lookup table:
  let lu = PATTERNS.lookup;

  let result = [];
  if (n_specific) {
    exlu = lu[nid]; // exit lookup
    if (x_specific) { // specific entrance and exit
      result = exlu[xid].slice();
    } else { // specific entrance, nonspecific exit
      let matches = ec__eids(xc);
      for (let exid of matches) {
        result = result.concat(exlu[exid]);
      }
    }
  } else { // nonspecific entrance
    let n_matches = ec__eids(nc);
    for (let enid of n_matches) {
      let exlu = lu[enid]; // exit lookup
      if (x_specific) { // but specific exit
        result = result.concat(exlu[xid]);
      } else { // nonspecific exit too
        let x_matches = ec__eids(xc);
        for (let exid of x_matches) {
          let joint = exlu[exid];
          if (joint != undefined) {
            result = result.concat(joint);
          }
        }
      }
    }
  }

  return result;
}

function central_possibilities(nori, xori) {
  // Returns a list of pattern indices containing all possible patterns whose
  // central cell has the given entrance and exit orientations.
  let result = [];
  let center = Math.floor((PATTERN_SIZE * PATTERN_SIZE) / 2);
  for (let pidx = 0; pidx < PATTERNS.positions.length; ++pidx) {
    let cidx = PATTERNS.indices[pidx][center];
    let orientations = PATTERNS.orientations[pidx];
    if (
      nori == orientations[cidx]
   && xori == opposite_side(orientations[cidx + 1])
    ) {
      result.push(pidx);
    }
  }
  return result;
}

function pattern_orientations(pattern, start_orientation) {
  // Takes a pattern and the orientation of its first cell (the direction that
  // that cell is entered from) and returns a list of orientations for each
  // cell in the pattern.

  let ori_list = [];

  // Entrance has same orientation as the pattern's entrance side.
  ori_list[0] = start_orientation;
  for (let i = 1; i < pattern.length; ++i) {
    // Compute orientation of each cell based on previous cell coords:
    let idx = pattern[i];
    let pr_idx = pattern[i-1];
    let pr_pc = idx__pc(pr_idx);
    let hr_pc = idx__pc(idx);
    ori_list[i] = nbs__ori(pr_pc, hr_pc);
  }

  return ori_list;
}

// -------
// Testing
// -------

function test_register_pattern() {
  let registry = {
    "positions": [],
    "indices": [],
    "orientations": [],
    "entrances": [],
    "exits": [],
    "lookup": {},
  }
  let p = [
    24, 23, 22, 17, 18,
    19, 14, 13,  8,  9,
     4,  3,  2,  1,  0,
     5,  6,  7, 12, 11,
    10, 15, 16, 21, 20
  ];
  let p2 = [
    20, 21, 22, 23, 24,
    19, 14,  9,  4,  3,
     8, 13, 18, 17, 16,
    15, 10,  5,  6, 11,
    12,  7,  2,  1,  0
  ];
  register_pattern(registry, [2, 2], [3, 2], p);
  register_pattern(registry, [1, 2], [3, 2], p);
  register_pattern(registry, [3, 2], [0, 0], p2);

  let n_patterns = 12;

  if (registry.positions.length != n_patterns) {
    return "Wrong number of positions.";
  }
  if (
    !same(
      registry.positions[0],
      [
        24, 23, 22, 17, 18,
        19, 14, 13,  8,  9,
         4,  3,  2,  1,  0,
         5,  6,  7, 12, 11,
        10, 15, 16, 21, 20
      ]
    )
  ) { return "positions[0] mismatch."; }
  if (
    !same(
      registry.positions[1],
      [
        20, 15, 10, 11, 16,
        21, 22, 17, 18, 23,
        24, 19, 14,  9,  4,
         3,  8, 13, 12,  7,
         2,  1,  6,  5,  0
      ]
    )
  ) { return "positions[1] mismatch."; }
  if (
    !same(
      registry.positions[8],
      [
        20, 21, 22, 23, 24,
        19, 14,  9,  4,  3,
         8, 13, 18, 17, 16,
        15, 10,  5,  6, 11,
        12,  7,  2,  1,  0
      ]
    )
  ) { return "positions[8] mismatch."; }

  if (registry.indices.length != n_patterns) {
    return "Wrong number of indices.";
  }
  if (
    !same(
      registry.indices[0],
      [
        14, 13, 12, 11, 10,
        15, 16, 17,  8,  9,
        20, 19, 18,  7,  6,
        21, 22,  3,  4,  5,
        24, 23,  2,  1,  0
      ]
    )
  ) { return "indices[0] mismatch."; }
  if (
    !same(
      registry.indices[1],
      [
        24, 21, 20, 15, 14,
        23, 22, 19, 16, 13,
         2,  3, 18, 17, 12,
         1,  4,  7,  8, 11,
         0,  5,  6,  9, 10
      ]
    )
  ) { return "indices[1] mismatch."; }
  if (
    !same(
      registry.indices[8],
      [
        24, 23, 22,  9,  8,
        17, 18, 21, 10,  7,
        16, 19, 20, 11,  6,
        15, 14, 13, 12,  5,
         0,  1,  2,  3,  4
      ]
    )
  ) { return "indices[8] mismatch."; }

  if (registry.orientations.length != n_patterns) {
    return "Wrong number of oris.";
  }
  if (
    !same(
      registry.orientations[0],
      [
         2, 1, 1, 2, 3,
         3, 2, 1, 2, 3,
         2, 1, 1, 1, 1,
         0, 3, 3, 0, 1,
         1, 0, 3, 0, 1
      ]
    )
  ) { return "orientations[0] mismatch."; }
  if (
    !same(
      registry.orientations[1],
      [
         3, 2, 2, 3, 0,
         0, 3, 2, 3, 0,
         3, 2, 2, 2, 2,
         1, 0, 0, 1, 2,
         2, 1, 0, 1, 2
      ]
    )
  ) { return "orientations[1] mismatch."; }
  if (
    !same(
      registry.orientations[8],
      [
        3, 3, 3, 3, 3,
        2, 2, 2, 2, 1,
        0, 0, 0, 1, 1,
        1, 2, 2, 3, 0,
        3, 2, 2, 1, 1
      ]
    )
  ) { return "orientations[8] mismatch."; }

  if (registry.entrances.length != n_patterns) {
    return "Wrong number of entrances.";
  }
  if (!same(registry.entrances[0], [2, 2])) { return "entrances[0] mismatch."; }
  if (!same(registry.entrances[1], [3, 2])) { return "entrances[1] mismatch."; }
  if (!same(registry.entrances[8], [3, 2])) { return "entrances[8] mismatch."; }

  if (registry.exits.length != n_patterns) { return "Wrong number of exits."; }
  if (!same(registry.exits[0], [3, 2])) { return "exits[0] mismatch."; }
  if (!same(registry.exits[1], [0, 0])) { return "exits[1] mismatch."; }
  if (!same(registry.exits[8], [0, 0])) { return "exits[8] mismatch."; }

  if (Object.keys(registry.lookup).length != 8) {
    return "Wrong number of lookup keys.";
  }
  if (!same(registry.lookup["2:2"]["3:2"], [0,11])) {
    return "lookup['2:2']['3:2'] mismatch.";
  }
  if (!same(registry.lookup["3:2"]["0:0"], [1,8])) {
    return "lookup['3:2']['0:0'] mismatch.";
  }
}

var TESTS = [
  [ "edge_seed:0", edge_seed([1, [4]], 2), edge_seed([1, [9]], 0) ],
  [ "edge_seed:1", edge_seed([1, [1]], 0), edge_seed([2, [7, 21]], 2) ],
  [ "orientation_at", orientation_at([0, []]), undefined ],
  [ "register_pattern", test_register_pattern(), undefined ],
  [
    "pattern_orientations",
    pattern_orientations(
      [
        24, 23, 22, 17, 18,
        19, 14, 13,  8,  9,
         4,  3,  2,  1,  0,
         5,  6,  7, 12, 11,
        10, 15, 16, 21, 20
      ],
      1
    ),
    [
      1, 1, 1, 2, 3,
      3, 2, 1, 2, 3,
      2, 1, 1, 1, 1,
      0, 3, 3, 0, 1,
      1, 0, 3, 0, 1
    ]
  ],
  [ "clockwise:0", clockwise([4, 4]), [4, 0] ],
  [ "clockwise:1", clockwise([3, 1]), [1, 1] ],
  [ "clockwise:2", clockwise([3, 2]), [2, 1] ],
  [ "clockwise:3", clockwise([0, 0]), [0, 4] ],
  [ "clockwise:4", clockwise([3, 0]), [0, 1] ],
  [ "idx__pc:0", idx__pc(24), [4, 4] ],
  [ "idx__pc:1", idx__pc(23), [4, 3] ],
  [ "idx__pc:2", idx__pc(12), [2, 2] ],
  [ "idx__pc:3", idx__pc(7), [1, 2] ],
  [ "idx__pc:4", idx__pc(15), [3, 0] ],
  [ "idx__pc__idx:0", pc__idx(idx__pc(7)), 7 ],
  [ "idx__pc__idx:1", pc__idx(idx__pc(15)), 15 ],
  [ "idx__pc__idx:2", pc__idx(idx__pc(20)), 20 ],
  [ "ridx:0", pc__idx(clockwise(idx__pc(20))), 0 ],
  [ "ridx:1", pc__idx(clockwise(idx__pc(0))), 4 ],
  [ "ridx:2", pc__idx(clockwise(idx__pc(15))), 1 ],
  [ "ridx:3", pc__idx(clockwise(idx__pc(24))), 20 ],
  [
    "rotate_pattern:0",
    rotate_pattern(
      [
        24, 23, 22, 17, 18,
        19, 14, 13, 8, 9,
        4, 3, 2, 1, 0,
        5, 6, 7, 12, 11,
        10, 15, 16, 21, 20
      ],
      0
    ),
    [
      24, 23, 22, 17, 18,
      19, 14, 13, 8, 9,
      4, 3, 2, 1, 0,
      5, 6, 7, 12, 11,
      10, 15, 16, 21, 20
    ],
  ],
  [
    "rotate_pattern:1",
    rotate_pattern(
      [
        24, 23, 22, 17, 18,
        19, 14, 13,  8,  9,
         4,  3,  2,  1,  0,
         5,  6,  7, 12, 11,
        10, 15, 16, 21, 20
      ],
      1
    ),
    [
      20, 15, 10, 11, 16,
      21, 22, 17, 18, 23,
      24, 19, 14,  9,  4,
       3,  8, 13, 12,  7,
       2,  1,  6,  5,  0
    ],
  ],
  [
    "rotate_pattern:2",
    rotate_pattern(
      [
        24, 23, 22, 17, 18,
        19, 14, 13,  8,  9,
         4,  3,  2,  1,  0,
         5,  6,  7, 12, 11,
        10, 15, 16, 21, 20
      ],
      2
    ),
    [
       0,  1,  2,  7,  6,
       5, 10, 11, 16, 15,
      20, 21, 22, 23, 24,
      19, 18, 17, 12, 13,
      14,  9,  8,  3,  4
    ],
  ],
  [
    "rotate_pattern:3",
    rotate_pattern(
      [
        24, 23, 22, 17, 18,
        19, 14, 13,  8,  9,
         4,  3,  2,  1,  0,
         5,  6,  7, 12, 11,
        10, 15, 16, 21, 20
      ],
      3
    ),
    [
       4,  9, 14, 13,  8,
       3,  2,  7,  6,  1,
       0,  5, 10, 15, 20,
       21, 16, 11, 12, 17,
       22, 23, 18, 19, 24
    ],
  ],
];

function same(v1, v2) {
  try {
    if (Array.isArray(v1)) {
      for (let i = 0; i < v1.length; ++i) {
        if (!same(v1[i], v2[i])) {
          return false;
        }
      }
      return true;
    } else { // TODO: Objects
      return v1 == v2;
    }
  } catch {
    return false;
  }
}

let failed = false;
for (let i in TESTS) {
  let t = TESTS[i];
  let name = t[0];
  let v1 = t[1];
  let v2 = t[2];
  if (!same(v1, v2)) {
    console.error("Test '" + name + "' (#" + i + ") failed.");
    console.log("Expected:");
    console.log(v2);
    console.log("Got:");
    console.log(v1);
    failed = true;
  }
}

// --------------------
// Onload Functionality
// --------------------

// Run when the document is loaded unless a test failed:
if (!failed) {
  window.onload = function () {
    // Start pattern-loading process immediately
    load_patterns();

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

    // Kick off generation subsystem
    gen_step();
  };
}
