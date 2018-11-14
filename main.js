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
var MIN_SCALE = 8;

// Comfortable scale level
var COMFORTABLE_SCALE = MIN_SCALE * 4;

// How much bigger than the interest bounding box should the scale be
var IDEAL_SCALE_MULTIPLIER = 1.6;

// Speed at which to change scales (percentage of scale difference per second)
var ZOOM_IN_SPEED = 1.2
var ZOOM_OUT_SPEED = 1.8

// Speed at which to pan the origin (percentage of distance-to-ideal-origin per
// second)
var PAN_SPEEDS = {
  'wiggle': 4.5,
  'grid': 0.8,
};

// The default color of the grid
var DEFAULT_GRID_COLOR = "#ffffff";

// The color of the destination
var DEST_COLOR = "#ffffff";

// The palette for trails
var PALETTE = [
  "#ff4444", // red
  "#ffff22", // yellow
  "#4466ff", // blue
  "#ff44cc", // pink
  "#44ccff", // light aqua
  "#ffaa22", // orange
  "#66ff66", // green
  "#f8ffaa", // cream
  "#bbeeff", // sky blue
  "#aaff44", // lime green
];

// The seeds for the different grids:
var GRID_SEEDS = [
  1947912873,
  2578974913,
  3195721145,
  4759174098,
];

// The palette for grids
var GRID_PALETTE = [
  "#44ccff", // light aqua
  "#ff44cc", // pink
  "#f8ffaa", // cream
  "#aaff44", // lime green
];

// Size of each pattern
var PATTERN_SIZE = 5;

// Length of each path
var PATH_LENGTH = (PATTERN_SIZE * PATTERN_SIZE);

// The fractally increasing bilayer caches. Values in the process of being
// generated are represented by WORKING_ON_IT, while never-requested values are
// undefined.
var BILAYER_CACHES = {};

// Queue for bilayers waiting to be generated. Each entry should be a pair
// containing a seed value and a set of fractal coordinates. Coordinates in the
// queue which cannot be generated because the superstructure they belong to
// hasn't been created yet will be removed and discarded.
var GEN_QUEUE = [];

// Number of bilayers to generate per gen step.
var GEN_SPEED = 12;

// Delay (ms) between generation ticks
var GEN_DELAY = 5;

// Delay (ms) between test attempts
var TEST_DELAY = 50;

// Delay (ms) between trails updates
var TRAILS_DELAY = 20;

// Delay between steps towards grid swaps
var GRID_SWAP_DELAY = 90;

// How many GRID_SWAP_DELAY increments before we swap grids
var GRID_SWAP_INCREMENTS = 100;

// Which grid we're on
var GRID_INDEX = 0;

// How much progress we've made towards swapping grids
var GRID_SWAP_PROGRESS = 0;

// Delay (ms) between destination advances
var DEST_ADVANCE_DELAY = 128;

// How long to wait between auto destination checks
var AUTO_DEST_DELAY = 30;

// How long to wait (in AUTO_DEST_DELAY cycles) before automatically setting a
// new destination.
var AUTO_DEST_WAIT = 100;

// Counter to keep track of the number of cycles until we should automatically
// set a new random destination.
var AUTO_DEST_COUNTER = 0;

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

// Object placeholder for things we're in the process of generating:
var WORKING_ON_IT = {};

// Whether to double-check generation integrity or to assume things work
// correctly.
var CHECK_GEN_INTEGRITY = true;

// Keep track of whether our destination changed:
var DEST_CHANGED = false;

// Have all wiggles reached the destination?
var AT_DESTINATION = true;

// Current mode
var MODE = undefined;

// Track first draw after mode change
var MODE_CHANGED = false;

// -------------------------
// Updaters & Event Handlers
// -------------------------

function set_mode(mode) {
  if (MODE != mode) {
    MODE_CHANGED = true;
  }
  MODE = mode;
}

function set_scale(context, scale_factor) {
  // Scale is in world-units-per-canvas-width
  if (scale_factor < MIN_SCALE) {
    scale_factor = MIN_SCALE;
  }
  context.scale = scale_factor;
}

function set_origin(context, origin) {
  context.origin = origin;
}

function set_destination(context, grid_coords) {
  // Sets the current destination.
  context.destination = grid_coords;
  DEST_CHANGED = true;
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

function on_canvas(vc) {
  return (
    0 <= vc[0] && vc[0] <= 1
 && 0 <= vc[1] && vc[1] <= 1
  );
}

function handle_tap(ctx, ev) {
  let vc = event_pos(ctx, ev);
  if (on_canvas(vc)) {
    let gc = wc__gc(cc__wc(ctx, vc__cc(ctx, vc)));
    set_destination(ctx, gc);
  }
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
    ((cc[0] - ctx.cwidth/2)/ctx.cwidth) * ctx.scale + ctx.origin[0],
    ((cc[1] - ctx.cheight/2)/ctx.cwidth) * ctx.scale + ctx.origin[1]
    // scale ignores canvas height
  ];
}

function wc__cc(ctx, wc) {
  return [
    ((wc[0] - ctx.origin[0]) / ctx.scale) * ctx.cwidth + ctx.cwidth/2,
    ((wc[1] - ctx.origin[1]) / ctx.scale) * ctx.cwidth + ctx.cheight/2
  ];
}

function canvas_unit(ctx) {
  // Returns the length of one world-coordinate unit in canvas coordinates.
  return (ctx.cwidth / ctx.scale);
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
    gc[0],
    gc[1]
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
  if (!FAILED) {
    window.requestAnimationFrame(draw_frame);
  } else {
    console.error("Draw loop aborted due to test failure.");
  }

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

  // Clear the canvas:
  CTX.clearRect(0, 0, CTX.cwidth, CTX.cheight);

  // TODO: DEBUG
  // draw_labyrinth(CTX, 19283, "#8888cc", 1, -2);
  // draw_labyrinth(CTX, 16481, "#44aa44", 1, 2);
  if (MODE_CHANGED) {
    MODE_CHANGED = false;
    set_origin(CTX, [0, 0]);
    set_scale(CTX, COMFORTABLE_SCALE);
    set_destination(CTX, [0, 0]);
  }
  if (MODE == 'wiggle') {
    adjust_viewport(CTX);
    draw_destination(CTX);
    draw_trails(CTX);
  } else if (MODE == 'grid') {
    adjust_viewport(CTX);
    draw_destination(CTX);

    let progress = GRID_SWAP_PROGRESS / GRID_SWAP_INCREMENTS;
    let α = 0.7 * Math.pow(progress, 3);
    let gidx = GRID_INDEX;
    let nx_gidx = posmod(GRID_INDEX + 1, GRID_SEEDS.length);
    draw_labyrinth(CTX, GRID_SEEDS[nx_gidx], GRID_PALETTE[nx_gidx], α);
    draw_labyrinth(CTX, GRID_SEEDS[gidx], GRID_PALETTE[gidx], 1 - α);
  } else { // unknown mode
    set_origin(CTX, [0, 0]);
    draw_labyrinth(CTX, 8579113, "#ffbb44");
  }
}

function interest_bb(ctx) {
  // Computes the bounding box of the interesting region (the region containing
  // all points of each trail) in world coordinates.
  result = {
    "left": ctx.destination[0],
    "right": ctx.destination[0],
    "top": ctx.destination[1],
    "bottom": ctx.destination[1]
  }

  if (MODE == 'wiggle') {
    for (let trail of ctx.trails) {
      for (let pos of trail.positions) {
        if (pos[0] < result.left) { result.left = pos[0]; }
        if (pos[0] > result.right) { result.right = pos[0]; }
        if (pos[1] < result.top) { result.top = pos[1]; }
        if (pos[1] > result.bottom) { result.bottom = pos[1]; }
      }
    }
  }
  return result;
}

function adjust_viewport(ctx) {
  // Adjusts the scaling factor and origin according to points of interest
  let ibb = interest_bb(ctx);

  if (MODE == 'wiggle') {
    let ar = (ctx.cwidth / ctx.cheight);
    let ideal_scale = Math.max(
      COMFORTABLE_SCALE,
      ibb.right - ibb.left,
      (ibb.bottom - ibb.top) * ar,
    ) * IDEAL_SCALE_MULTIPLIER;

    let scale_diff = ideal_scale - ctx.scale;

    let zs;
    if (scale_diff > 0) { // zooming out
      zs = ZOOM_OUT_SPEED;
    } else {
      zs = ZOOM_IN_SPEED;
    }

    ctx.scale = Math.max(
      MIN_SCALE,
      ctx.scale + zs * scale_diff * (ctx.elapsed / 1000)
    );
  }

  let ideal_center = [
    (ibb.left + ibb.right) / 2,
    (ibb.top + ibb.bottom) / 2
  ];

  let center_diff = [
    ideal_center[0] - ctx.origin[0],
    ideal_center[1] - ctx.origin[1]
  ];

  ctx.origin = [
    ctx.origin[0] + PAN_SPEEDS[MODE] * center_diff[0] * (ctx.elapsed / 1000),
    ctx.origin[1] + PAN_SPEEDS[MODE] * center_diff[1] * (ctx.elapsed / 1000),
  ];
}

function orientation_at(fc) {
  // Returns the orientation of the cell at the given fractal coordinates, or
  // undefined if sufficient information has not yet been cached. Requests the
  // generation of new bilayers as appropriate because it uses lookup_bilayer.

  let seed = fc[0];
  let height = fc[1];
  let trace = fc[2];
  let bilayer = lookup_bilayer(
    [seed, height, trace.slice(0, trace.length - 1)]
  );

  // Our trace and pattern index:
  let pidx = trace[trace.length - 1];

  if (bilayer == undefined) { // not available yet; has been requested
    return undefined;
  }

  // Look up cell orientation:
  let lidx = PATTERNS.indices[bilayer.pattern][pidx];
  return PATTERNS.orientations[bilayer.pattern][lidx];
}

function draw_labyrinth(ctx, seed, color, α, offset) {
  // Draws the visible portion of the labyrinth. α controls global alpha of the
  // drawn labyrinth, while offset nudges the lines southeast in absolute
  // coordinates. Color, α, and offset are each optional and default to the
  // DEFAULT_GRID_COLOR, 1, and 0 respectively.
  if (color == undefined) {
    color = DEFAULT_GRID_COLOR;
  }

  if (α == undefined) {
    α = 1;
  }

  if (offset == undefined) {
    offset = 0;
  }

  // Set stroke color:
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = α;

  // Radius of each grid cell
  let cell_size = canvas_unit(ctx);

  // Iterate over visible (and a few invisible) cells at the base layer:
  let extrema = grid_extrema(ctx);
  for (let x = extrema['NW'][0] - 1; x <= extrema['NE'][0] + 1; ++x) {
    for (let y = extrema['NW'][1] - 1; y <= extrema['SW'][1] + 1; ++y) {
      // Canvas coordinates for this grid cell:
      let cc = wc__cc(ctx, gc__wc([ x, y ]));

      // Draw a from-link for each cell
      let fc = ac__fc(seed, [x, y]);
      let ori = orientation_at(fc);

      if (ori == undefined) { // not available yet; has been requested
        // Just draw a circle
        ctx.beginPath();
        ctx.arc(cc[0] + offset, cc[1] + offset, cell_size*0.2, 0, 2*Math.PI);
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
        ctx.moveTo(st_cc[0] + offset, st_cc[1] + offset);
        ctx.lineTo(cc[0] + offset, cc[1] + offset);
        ctx.stroke();

      }
    }
  }

  // Done drawing the labyrinth (reset our global alpha)
  ctx.globalAlpha = 1;
}

function draw_destination(ctx) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = DEST_COLOR;
  ctx.fillStyle = DEST_COLOR;
  let α = 1;
  if (MODE == 'wiggle') {
    α = 1 - (AUTO_DEST_COUNTER / AUTO_DEST_WAIT);
  }
  ctx.beginPath();
  let cc = wc__cc(ctx, ctx.destination);
  ctx.arc(cc[0], cc[1], canvas_unit(ctx)*0.2, 0, 2*Math.PI);
  ctx.globalAlpha = α;
  ctx.stroke();
  ctx.globalAlpha = 0.25 * α;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function draw_trails(ctx) {
  // Draws a path for each trail, connecting the world coordinates of the trail
  // together into a path.
  ctx.lineWidth = 3;
  let unit = canvas_unit(ctx);
  for (let tr of ctx.trails) {

    let first = tr.positions[0];
    let cc = wc__cc(ctx, first);
    for (let i = 1; i < tr.positions.length; ++i) {
      ctx.beginPath();
      ctx.moveTo(cc[0], cc[1]);
      let pos = tr.positions[i];
      cc = wc__cc(ctx, pos);
      ctx.lineTo(cc[0], cc[1]);
      ctx.strokeStyle = tr.color;
      let interp = (i / tr.positions.length);
      ctx.globalAlpha = Math.pow(interp, 1.65);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1.0;
}

// ---------
// Misc Code
// ---------

function blend_color(c1, c2, r) {
  // Blends 1-r of the first color with r of the second color. Does silly RGB
  // interpolation.
  c1 = c1.slice(1);
  c2 = c2.slice(1);

  let r1 = parseInt(c1.slice(0, 2), 16);
  let g1 = parseInt(c1.slice(2, 4), 16);
  let b1 = parseInt(c1.slice(4, 6), 16);
  a1 = 255;
  if (c1.length > 6) { let a1 = parseInt(c1.slice(6, 8)); }

  let r2 = parseInt(c2.slice(0, 2), 16);
  let g2 = parseInt(c2.slice(2, 4), 16);
  let b2 = parseInt(c2.slice(4, 6), 16);
  a2 = 255;
  if (c2.length > 6) { let a2 = parseInt(c2.slice(6, 8)); }

  let new_r = Math.floor(r1 * (1 - r) + r2 * r);
  let new_g = Math.floor(g1 * (1 - r) + g2 * r);
  let new_b = Math.floor(b1 * (1 - r) + b2 * r);
  let new_a = Math.floor(a1 * (1 - r) + a2 * r);

  let hr = new_r.toString(16);
  if (hr.length == 1) { hr = "0" + hr; }
  let hg = new_g.toString(16);
  if (hg.length == 1) { hg = "0" + hg; }
  let hb = new_b.toString(16);
  if (hb.length == 1) { hb = "0" + hb; }
  let ha = new_a.toString(16);
  if (ha.length == 1) { ha = "0" + ha; }
  return "#" + hr + hg + hb + ha;
}

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
  return posmod(seed, up_to);
}

function choose_randomly(possibilities, seed) {
  // Picks randomly from a list using the given seed.
  let idx = posmod(seed, possibilities.length);
  return possibilities[idx];
}

function random_socket(seed) {
  // Picks a random edge socket using the given seed.
  return posmod(seed, Math.floor(PATTERN_SIZE/2));
}

function random_universal_socket(seed) {
  // Picks a random socket that's a universal connector, meaning it doesn't put
  // any constraints on the other entrance/exit socket of a cell it's added to.
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

function origin_for(seed) {
  // Returns the origin coordinates for the given seed. These will always be
  // within PATTERN_SIZE units of the origin.
  let r = lfsr(seed + 17371947103);
  let x = r % PATTERN_SIZE;
  r = lfsr(r);
  let y = r % PATTERN_SIZE;
  return [ x, y ];
}


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
  let seed = fc[0];
  let height = fc[1];
  let trace = fc[2];

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

  let origin = origin_for(seed);
  return [
    result[0] + origin[0],
    result[1] + origin[1]
  ];
}

function ac__fc(seed, ac) {
  let origin = origin_for(seed);
  let off_ac = [ ac[0] - origin[0], ac[1] - origin[1] ];
  let distance = Math.max(Math.abs(off_ac[0]), Math.abs(off_ac[1]));
  // special case for the origin:
  if (distance == 0) {
    return [ seed, 0, [ 12 ] ];
  }
  // factor of two here because each n×n is centered at the origin, so only n/2
  // of it extends away from the origin.
  let height = Math.floor(Math.log(distance*2) / Math.log(PATTERN_SIZE));
  let cw = Math.pow(5, height);

  let trace = [];
  let rc = [
    off_ac[0] + cw * PATTERN_SIZE/2,
    off_ac[1] + cw * PATTERN_SIZE/2
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

  return [seed, height, trace];
}

function fc__edge_ac(fc, edge) {
  // Works like fc__ac, but computes the coordinates of the middle of a
  // specific edge of the given bilayer (or cell). The edge is specified using
  // a number from 0 to 3, denoting North, East, South, and West in that order.
  let ac = fc__ac(fc);

  let seed = fc_seed(fc);
  let height = fc_height(fc);
  let trace = fc_trace(fc);
  let edge_height = height - trace.length

  let pw = Math.pow(5, edge_height+1); // width of a pattern

  let ev = ori__vec(edge); // edge vector

  let origin = origin_for(seed);
  let off_ac = [ ac[0] + origin[0], ac[1] + origin[1] ];
  return [
    off_ac[0] + ev[0] * pw/2,
    off_ac[1] + ev[1] * pw/2
  ];
}

function fc_seed(fc) {
  // Returns the seed of the given fractal coordinates
  return fc[0];
}

function fc_height(fc) {
  // Returns the height of the given fractal coordinates
  return fc[1];
}

function fc_trace(fc) {
  // Returns the trace of the given fractal coordinates.
  return fc[2];
}

function build_fc(seed, height, trace) {
  // Builds a set of fractal coordinates out of a seed, a height, and a trace.
  return [seed, height, trace];
}

function extend_fc(fc) {
  // Extends the given fractal coordinates so that their height is increased by
  // one while still denoting the same cell. Returns a new set of coordinates
  // without modifying the originals.
  let seed = fc_seed(fc);
  let height = fc_height(fc);
  let trace = fc_trace(fc);
  let center = Math.floor(PATH_LENGTH / 2);
  return [
    seed,
    height + 1,
    [ center ].concat(trace)
  ];
}

function parent_of(fc) {
  // Returns the fractal coordinates of the parent of the given cell.
  let seed = fc_seed(fc);
  let height = fc_height(fc);
  let trace = fc_trace(fc);
  if (trace.length <= 1) {
    return parent_of(extend_fc(fc));
  }
  return [
    seed,
    height,
    trace.slice(0, trace.length - 1)
  ];
}

function normalize_fc(fc) {
  // Retracts the given fractal coordinates as much as possible, getting rid of
  // unnecessary height and central indices. The result still refers to the
  // same cell. Returns a new set of coordinates without modifying the
  // originals.
  let seed = fc_seed(fc);
  let height = fc_height(fc);
  let trace = fc_trace(fc).slice();
  let center = Math.floor(PATH_LENGTH / 2);
  while (trace[0] == center) {
    height -= 1;
    trace.shift();
  }
  return [seed, height, trace];
}

function local_seed(fr_coords) {
  // Determines the local bilayer seed for the given fractal coordinate
  // location.
  let seed = fc_seed(fr_coords);
  let height = fc_height(fr_coords);
  let trace = fc_trace(fr_coords);
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
  let seed = fc_seed(fr_coords);
  let ec = fc__edge_ac(fr_coords, edge);
  let height = 1 + (fc_height(fr_coords) - fc_trace(fr_coords).length);
  let mix = ((seed + (17*ec[0])) ^ ec[1]) + 3*height;
  let churn = mix % 4;
  for (let i = 0; i < churn; ++i) {
    mix = lfsr(mix + height);
  }
  return mix;
}

function central_coords(seed, height) {
  // Returns the fractal coordinates for the central bilayer just below the
  // given height (or just the central grid cell for height=0).
  let center = Math.floor(PATH_LENGTH / 2);
  return [ seed, height, [ center ] ];
}

var CLOSE_DESTINATIONS = [];
var CLOSE_SIZE = 60;
for (let x = -CLOSE_SIZE; x <= CLOSE_SIZE; ++x) {
  for (let y = -CLOSE_SIZE; y <= CLOSE_SIZE; ++y) {
    CLOSE_DESTINATIONS.push([x, y]);
  }
}
// Fisher-Yates
var RDEST_SEED = lfsr(39872081);
for (let i = 0; i < CLOSE_DESTINATIONS.length; ++i) {
  let remaining = CLOSE_DESTINATIONS.length - i - 1;
  let choice = posmod(RDEST_SEED, remaining + 1);
  let tmp = CLOSE_DESTINATIONS[i];
  CLOSE_DESTINATIONS[i] = CLOSE_DESTINATIONS[i + choice];
  CLOSE_DESTINATIONS[i + choice] = tmp;
  RDEST_SEED = lfsr(RDEST_SEED + lfsr(i));
}

// Which nearby destination we're going to now.
var WHICH_DEST = 0;

function next_destination(ctx) {
  // Returns the next destination from a shuffled list of nearby destinations.
  WHICH_DEST = posmod(WHICH_DEST + 1, CLOSE_DESTINATIONS.length);
  return CLOSE_DESTINATIONS[WHICH_DEST];
}

// ------------------
// Caching and Lookup
// ------------------

function request_central_bilayer(seed) {
  if (!BILAYER_CACHES.hasOwnProperty(seed)) {
    BILAYER_CACHES[seed] = [];
  }
  let cache = BILAYER_CACHES[seed];
  if (cache[cache.length - 1] == WORKING_ON_IT) {
    // We're already working on the next central bilayer
    return;
  }
  let height = cache.length;
  cache[height] = WORKING_ON_IT;
  let fr_coords = central_coords(seed, height);
  GEN_QUEUE.push(fr_coords);
}

function lookup_bilayer(fr_coords) {
  // Looks up the cached bilayer at the given fractal coordinates, or returns
  // undefined and adds an entry to the generation queue if that bilayer or one
  // of its parents is not yet cached.
  let seed = fc_seed(fr_coords);
  let height = fc_height(fr_coords);
  let trace = fc_trace(fr_coords);

  let cache = BILAYER_CACHES[seed];
  if (cache == undefined) {
    cache = [];
    BILAYER_CACHES[seed] = cache;
  }

  if (cache.length < height + 1) {
    request_central_bilayer(seed);
    return undefined;
  }
  let ancestor = cache[height];
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
      GEN_QUEUE.push([seed, height, sofar]);
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
  let next = GEN_QUEUE.shift();
  if (next == undefined) {
    return; // nothing to do right now
  }
  let seed = next[0];
  let cache = BILAYER_CACHES[seed];
  if (cache == undefined) {
    cache = [];
    BILAYER_CACHES[seed] = cache;
  }
  if (cache[cache.length - 1] == WORKING_ON_IT) {
    let above;
    if (cache.length > 1) {
      above = gen_central_bilayer(
        seed,
        cache.length - 1,
        cache[cache.length - 2]
      ); // must embed this @ center
    } else {
      above = gen_central_bilayer(seed, cache.length - 1, null);
      // no constraint
    }
    cache[cache.length - 1] = above;
  }
  let height = fc_height(next);
  let trace = fc_trace(next);
  // Pop last entry in trace (points to bilayer we're being asked to generate)
  // and keep the rest to find our parent:
  let last = trace.pop();
  let parent = lookup_bilayer([seed, height, trace]);
  if (
    parent != WORKING_ON_IT
 && parent != undefined
 && parent.children != null
 && parent.children[last] == WORKING_ON_IT
  ) {
    parent.children[last] = gen_bilayer([seed, height, trace], parent, last);
  }
}


// -----------
// Trails Code
// -----------

function advance_trails(ctx) {
  let dest = ctx.destination;

  let moved = 0;
  for (tr of ctx.trails) {
    let seed = tr.seed;
    let alt_seed = tr.alt_seed;

    // fractal coords of destination:
    let dfc = ac__fc(seed, dest);
    let alt_dfc = ac__fc(alt_seed, dest);

    // head of path:
    let coords = tr.positions;
    let head = coords[coords.length - 1];

    // fractal coords of path head:
    let hfc = ac__fc(seed, head);
    let alt_hfc = ac__fc(alt_seed, head);

    // distances to destination:
    let dist = distance_to(hfc, dfc);
    let alt_dist = distance_to(alt_hfc, alt_dfc);

    let n_fc, alt_n_fc;
    if (dist > 0) {
      n_fc = next_fc(hfc);
    } else if (dist < 0) {
      n_fc = prev_fc(hfc);
    } else {
      // skip this trail, since there's missing info or it has arrived
      continue;
    }

    if (alt_dist > 0) {
      alt_n_fc = next_fc(alt_hfc);
    } else if (alt_dist < 0) {
      alt_n_fc = prev_fc(alt_hfc);
    } else {
      // skip this trail, since there's missing info or it has arrived
      continue;
    }

    let n_alt_fc = ac__fc(alt_seed, fc__ac(n_fc));
    let unalt_n_fc = ac__fc(seed, fc__ac(alt_n_fc));

    // the four potential distances:
    let n_dist = distance_to(n_fc, dfc);
    let n_alt_dist = distance_to(n_alt_fc, alt_dfc);

    let alt_n_dist = distance_to(alt_n_fc, alt_dfc);
    let unalt_n_dist = distance_to(unalt_n_fc, dfc);

    if (
      n_dist == undefined
   || n_alt_dist == undefined
   || alt_n_dist == undefined
   || unalt_n_dist == undefined
    ) {
      // Skip if we're missing info
      continue;
    }

    // combined distances used to pick which direction to go in:
    let unalt_combined = Math.min(Math.abs(n_dist), Math.abs(n_alt_dist));
    let alt_combined = Math.min(Math.abs(alt_n_dist), Math.abs(unalt_n_dist));

    let chosen; // next fractal coords
    if (unalt_combined < alt_combined) { // unalt is better
      chosen = n_fc;
    } else {
      chosen = alt_n_fc;
    }
    let next = fc__ac(chosen);
    moved += 1;
    coords.push(next);
    if (coords.length > TRAIL_LENGTH) {
      coords.shift();
    }
  }

  // Reset
  DEST_CHANGED = false;

  AT_DESTINATION = moved == 0; // report whether we're stopped or not

  // Requeue
  if (!FAILED) {
    window.setTimeout(advance_trails, TRAILS_DELAY, ctx);
  } else {
    console.error("Stopped trails due to test failure.");
  }
}

function advance_destination(ctx) {

  if (MODE == 'grid') {
    let fc = ac__fc(GRID_SEEDS[GRID_INDEX], ctx.destination)
    let nfc = next_fc(fc);
    if (nfc != undefined) {
      set_destination(ctx, fc__ac(nfc));
    }
  }

  // Requeue
  if (!FAILED) {
    window.setTimeout(advance_destination, DEST_ADVANCE_DELAY, ctx);
  } else {
    console.error("Stopped destination advance due to test failure.");
  }
}

function adjust_tempo(n) {
  if (MODE == 'wiggle') {
    TRAILS_DELAY *= n;
    if (TRAILS_DELAY <= 1) { TRAILS_DELAY = 1; }
    if (TRAILS_DELAY >= 1000) { TRAILS_DELAY = 1000; }
  } else {
    DEST_ADVANCE_DELAY *= n;
    if (DEST_ADVANCE_DELAY <= 1) { DEST_ADVANCE_DELAY = 1; }
    if (DEST_ADVANCE_DELAY >= 1000) { DEST_ADVANCE_DELAY = 1000; }
  }
}

function scramble_destination(ctx) {
  let do_scramble = document.getElementById("attract_mode").checked;
  if (do_scramble && MODE == 'wiggle' && AT_DESTINATION) {
    AUTO_DEST_COUNTER += 1;
    if (AUTO_DEST_COUNTER >= AUTO_DEST_WAIT) {
      set_destination(ctx, next_destination(ctx));
      AUTO_DEST_COUNTER = 0;
    }
  } else {
    AUTO_DEST_COUNTER = 0;
  }

  // Requeue
  if (!FAILED) {
    window.setTimeout(scramble_destination, AUTO_DEST_DELAY, ctx);
  } else {
    console.error("Stopped destination scrambling due to test failure.");
  }
}

function swap_grids(ctx) {
  let do_swap = document.getElementById("attract_mode").checked;
  if (MODE == 'grid' && do_swap) {
    GRID_SWAP_PROGRESS += 1;
    if (GRID_SWAP_PROGRESS >= GRID_SWAP_INCREMENTS) {
      // swap grids
      GRID_INDEX = posmod(GRID_INDEX + 1, GRID_SEEDS.length);
      GRID_SWAP_PROGRESS = 0;
    }
  } else {
    GRID_SWAP_PROGRESS = 0;
  }

  // Requeue
  if (!FAILED) {
    window.setTimeout(swap_grids, GRID_SWAP_DELAY, ctx);
  } else {
    console.error("Stopped grid swapping due to test failure.");
  }
}

function next_fc(fc) {
  // Computes the fractal coordinates of the grid cell after the given
  // (fully-specified) fractal coordinates. Returns undefined if there's
  // unloaded information that's needed.
  let seed = fc_seed(fc);
  let height = fc_height(fc);
  let trace = fc_trace(fc);
  let bilayer = lookup_bilayer(parent_of(fc));

  // Our trace and pattern index:
  let pidx = trace[trace.length - 1];

  if (bilayer == undefined) { // not available yet; has been requested
    return undefined;
  }

  // Look up cell orientation:
  let lidx = PATTERNS.indices[bilayer.pattern][pidx];
  if (lidx == PATH_LENGTH - 1) {
    let xori = PATTERNS.exits[bilayer.pattern][0];
    let xvec = ori__vec(xori);
    let ac = fc__ac(fc);
    let next_ac = [
      ac[0] + xvec[0],
      ac[1] + xvec[1]
    ];
    return ac__fc(seed, next_ac);
  } else {
    let new_trace = trace.slice(0, trace.length - 1);
    new_trace.push(PATTERNS.positions[bilayer.pattern][lidx + 1]);
    return [seed, height, new_trace];
  }
}

function prev_fc(fc) {
  // Inverse of next_fc.
  let seed = fc_seed(fc);
  let height = fc_height(fc);
  let trace = fc_trace(fc);
  let bilayer = lookup_bilayer(parent_of(fc));

  // Our trace and pattern index:
  let pidx = trace[trace.length - 1];

  if (bilayer == undefined) { // not available yet; has been requested
    return undefined;
  }

  // Look up cell orientation:
  let lidx = PATTERNS.indices[bilayer.pattern][pidx];
  if (lidx == 0) {
    let nori = PATTERNS.entrances[bilayer.pattern][0];
    let nvec = ori__vec(nori);
    let ac = fc__ac(fc);
    let prev_ac = [
      ac[0] + nvec[0],
      ac[1] + nvec[1]
    ];
    return ac__fc(seed, prev_ac);
  } else {
    let new_trace = trace.slice(0, trace.length - 1);
    new_trace.push(PATTERNS.positions[bilayer.pattern][lidx - 1]);
    return [seed, height, new_trace];
  }
}

function common_parent(from_fc, to_fc) {
  // Finds the fractal coordinates of the closest parent bilayer which contains
  // both from_fc and to_fc. Returns a list containing those coordinates
  // followed by the pattern indices of the from and to coordinates within that
  // bilayer. Returns undefined if given coordinates with different seeds.
  // Check seeds:
  if (fc_seed(from_fc) != fc_seed(to_fc)) {
    return undefined;
  }

  // Extend the heights of each coordinate to match:
  while (fc_height(from_fc) < fc_height(to_fc)) {
    from_fc = extend_fc(from_fc);
  }
  while (fc_height(to_fc) < fc_height(from_fc)) {
    to_fc = extend_fc(to_fc);
  }

  // Extend each one more time so they definitely coincide somewhere:
  from_fc = extend_fc(from_fc);
  to_fc = extend_fc(to_fc);

  // Common seed:
  let seed = fc_seed(from_fc);

  // Max-height:
  let height = fc_height(from_fc);

  // Loop to find where they first differ and remember where they're last the
  // same:
  let co_fc = build_fc(seed, height, []);
  let fr_pidx, to_pidx;
  for (let i = 0; i < height + 1; ++i) {
    fr_pidx = fc_trace(from_fc)[i];
    to_pidx = fc_trace(to_fc)[i];
    if (fr_pidx != to_pidx) {
      break;
    } // else extend shared trace:
    fc_trace(co_fc).push(fr_pidx);
  }

  // Return the combined coordinates along with the positions (pattern indices)
  // of the start and end coordinates within that bilayer.
  return [co_fc, fr_pidx, to_pidx];
}

function is_inside(outer_fc, inner_fc) {
  // Returns whether the given inner_fc is inside the given outer_fc.
  if (fc_seed(outer_fc) != fc_seed(inner_fc)) {
    return false; // seeds don't match
  }

  while (fc_height(outer_fc) < fc_height(inner_fc)) {
    outer_fc = extend_fc(outer_fc);
  }

  let oh = fc_height(outer_fc);
  let ih = fc_height(inner_fc);

  let hd = oh - ih;

  let o_trail = fc_trace(outer_fc);
  let i_trail = fc_trace(inner_fc);

  var dscnt;
  for (dscnt = hd; dscnt < o_trail.length; ++dscnt) {
    if (i_trail[dscnt - hd] != o_trail[dscnt]) {
      return false;
    }
  }
  return dscnt - hd < i_trail.length;
}

function direction_towards(from_fc, to_fc) {
  // Computes the direction (forward or reverse) that's required to travel from
  // the from_fc to the to_fc (both fractal coordinates). Returns -1 for
  // reverse, 1 for forward, and 0 for identical coordinates. Returns undefined
  // if the required information is not yet loaded.

  // Check for matching coordinates:
  if (same(from_fc, to_fc)) {
    return 0;
  }

  // Find common parent info:
  let joint = common_parent(from_fc, to_fc);
  if (joint == undefined) {
    return undefined;
  }
  let co_fc = joint[0];
  let fr_pidx = joint[1];
  let to_pidx = joint[2];

  // Compute fractal coords where they last coincide:
  let shared_bilayer = lookup_bilayer(co_fc);
  if (shared_bilayer == undefined) {
    return undefined;
  }

  if (fr_pidx == to_pidx) {
    console.error("IDENTICAL fr/to PIDXs: " + fr_pidx);
  }
  let indices = PATTERNS.indices[shared_bilayer.pattern];
  if (indices[fr_pidx] < indices[to_pidx]) {
    return 1;
  } else {
    return -1;
  }
  console.error("Didn't find from OR to pattern indices in direction_towards!");
  return undefined;
}

function distance_to(from_fc, to_fc) {
  // Like direction_towards, but returns a (positive or negative) distance
  // value instead of just a direction value. Returns undefined if the required
  // information is not yet loaded.

  // Check for matching coordinates:
  if (same(from_fc, to_fc)) {
    return 0;
  }

  // Find common parent info:
  let joint = common_parent(from_fc, to_fc);
  if (joint == undefined) {
    return undefined;
  }

  let co_fc = joint[0];

  let fr_pidx = joint[1];
  let fr_sub_trace = fc_trace(co_fc).slice();
  fr_sub_trace.push(fr_pidx);

  let to_pidx = joint[2];
  let to_sub_trace = fc_trace(co_fc).slice();
  to_sub_trace.push(to_pidx);

  // Compute fractal coords where they last coincide:
  let shared_bilayer = lookup_bilayer(co_fc);
  if (shared_bilayer == undefined) {
    return undefined;
  }

  if (fr_pidx == to_pidx) {
    console.error("IDENTICAL fr/to PIDXs: " + fr_pidx);
  }
  let indices = PATTERNS.indices[shared_bilayer.pattern];
  let sign = 0;
  if (indices[fr_pidx] < indices[to_pidx]) {
    sign = 1;
  } else {
    sign = -1;
  }
  let between = Math.abs(indices[to_pidx] - indices[fr_pidx] - 1);
  let height = (
    fc_height(shared_bilayer.coords)
  - fc_trace(shared_bilayer.coords).length
  );
  let tile_side = Math.pow(PATTERN_SIZE, height);
  let cost_per_tile = tile_side * tile_side;

  let from_escape = distance_to_escape(
    from_fc,
    height - 1,
    sign
  );
  if (from_escape == undefined) { return undefined; }
  let to_escape = distance_to_escape(
    to_fc,
    height - 1,
    -sign
  );
  if (to_escape == undefined) { return undefined; }
  let in_between = between * cost_per_tile;
  if (height <= 0) {
    in_between += 1;
  }

  let adjust = 0;
  if (from_escape > 0 && to_escape > 0) {
    adjust = 1;
  }
  return sign * (from_escape + to_escape + in_between - adjust);
}

function distance_to_escape(fc, target_height, direction) {
  // Returns the distance from the given fractal coordinates to the edge of the
  // super-cell for those coordinates with the given height, in the given
  // direction. Returns undefined if there is missing info, or zero if the
  // specified cell is already at or above the target height. 
  let height = fc_height(fc)
  let trace = fc_trace(fc);
  let pidx = trace[trace.length - 1];

  // Effective height:
  let e_height = height - trace.length;

  //console.log(fc, target_height, e_height);

  // Base case:
  if (e_height >= target_height) {
    return 0;
  }

  let bilayer = lookup_bilayer(parent_of(fc))
  if (bilayer == undefined) {
    return undefined;
  }

  let idx = PATTERNS.indices[bilayer.pattern][pidx];

  let local = 0;
  if (direction > 0) {
    local = PATH_LENGTH - idx;
  } else {
    local = idx + 1;
  }
  let unit = Math.pow(PATTERN_SIZE, e_height + 1);
  unit *= unit;
  local *= unit;

  let above = distance_to_escape(
    parent_of(fc),
    target_height,
    direction
  );
  if (above == undefined) {
    return undefined;
  } else {
    return local + above;
  }
}


// --------------
// Labyrinth Code
// --------------

function gen_central_bilayer(seed, height, child_bilayer) {
  // Using the given seed, height, and child bilayer, generates and returns the
  // central bilayer, at the given height.

  // Compute the seed
  let fc = central_coords(seed, height + 1);
  let l_seed = local_seed(fc);

  // Assemble empty result:
  result = {
   "coords": fc,
   "seed": l_seed,
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
    let center = Math.floor(PATH_LENGTH / 2);
    result.sub_patterns[center] = constraint;
    result.children[center] = child_bilayer;

    // Isolate that central pattern:
    isolate_center_pattern(result);
  } else { // No child, so we're at the base layer
    result.sub_patterns = null; // there are no sub-patterns
    result.children = null; // there are no children

    // Pick random entrance/exit orientations:
    let nori = randint(4, lfsr(seed + 75981238));
    let xori = randint(4, lfsr(seed + 3127948));

    // Sockets chosen at random, with one being universal to avoid the potential
    // for collision.
    // TODO: Was this necessary?
    // so that its entrance and exit will have the appropriate
    // edge sockets for their neighbors.
    // TODO: This can pick incompatible sockets!?!
    let n_socket = random_socket(edge_seed(fc, nori));
    let x_socket = random_universal_socket(edge_seed(fc, xori));
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
 let seed = parent_fc[0];
 let height = parent_fc[1];
 let ptrace = parent_fc[2];
 let trace = ptrace.slice();
 trace.push(index);
 let fc = [seed, height, trace];
 let nr_fc = normalize_fc(fc);

 // Compute the seed
 let l_seed = local_seed(nr_fc);

 // Look up the pattern index in our parent:
 let pattern = parent_bilayer.sub_patterns[index];
 if (pattern == undefined) {
   console.error("Missing sub_pattern in gen_ilayer.");
   console.log(parent_bilayer);
 }
 
 // Create result
 result = {
   "coords": nr_fc,
   "seed": l_seed,
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
  let center = Math.floor(PATH_LENGTH / 2);
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
    console.error(bilayer);
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
  let positions = PATTERNS.positions[bilayer.pattern];
  let indices = PATTERNS.indices[bilayer.pattern];
  let orientations = PATTERNS.orientations[bilayer.pattern];
  let seed = lfsr(bilayer.seed + 5786297813);
  // Doesn't touch entrance or exit
  for (let lidx = 1; lidx < positions.length-1; ++lidx) {
    let pidx = positions[lidx];
    let pc = idx__pc(pidx);
    if (bilayer.sub_patterns[pidx] == undefined) {
      // get prev + next indices
      let prev = positions[lidx-1];
      let next = positions[lidx+1];

      // compute entrance/exit orientations
      let prpc = idx__pc(prev);
      let nori = orientations[lidx];
      let nxpc = idx__pc(next);
      let xori = opposite_side(orientations[lidx + 1]);

      // pick entrance/exit sockets
      let pxs = undefined; // previous exit socket
      let ppat = bilayer.sub_patterns[prev];
      if (ppat != undefined && ppat != WORKING_ON_IT) {
        pxs = PATTERNS.exits[ppat][1]; // just the socket
      }

      let nns = undefined; // next entrance socket
      let npat = bilayer.sub_patterns[next];
      if (npat != undefined && npat != WORKING_ON_IT) {
        nns = PATTERNS.entrances[npat][1]; // just the socket
      }

      // Patterns that fit:
      let poss = pattern_possibilities([nori, pxs], [xori, nns]);

      // Pick a random pattern that fits:
      let pick = choose_randomly(poss, seed)

      // Confirm connectivity:
      if (CHECK_GEN_INTEGRITY) {
        if (pick == undefined) {
          console.error(
            "Failed to pick a pattern for " + [nori, pxs] + " → " + [xori, nns]
          );
        }
        let n_new = PATTERNS.entrances[pick];
        let x_new = PATTERNS.exits[pick];
        if (
          pxs == undefined
       && (
            ppat != undefined
         && ppat != WORKING_ON_IT
          )
        ) {
          console.error("Prev socket unavailable for defined pattern.");
        }
        if (
          nns == undefined
       && (
            npat != undefined
         && npat != WORKING_ON_IT
          )
        ) {
          console.error("Next socket unavailable for defined pattern.");
        }
        if (n_new[0] != nori) {
          console.error(
            "Picked pattern has wrong entrance orientation: "
          + n_new[0] + " != " + nori
          );
        }
        if (x_new[0] != xori) {
          console.error(
            "Picked pattern has wrong exit orientation: "
          + x_new[0] + " != " + xori
          );
        }
        if (pxs != undefined && n_new[1] != pxs) {
          console.error(
            "Picked pattern has wrong entrance socket: "
          + n_new[1] + " != " + pxs
          );
        }
        if (nns != undefined && x_new[1] != nns) {
          console.error(
            "Picked pattern has wrong exit socket: "
          + x_new[1] + " != " + nns
          );
        }
      }

      // Set sub-pattern and continue to the next one:
      bilayer.sub_patterns[pidx] = pick;
      seed = lfsr(seed);
    }
  }

  if (CHECK_GEN_INTEGRITY) {
    for (let i = 0; i < positions.length; ++i) {
      let lidx = PATTERNS.indices[bilayer.pattern][i];
      let ori = PATTERNS.orientations[bilayer.pattern][lidx];
      if (lidx > 0) {
        let pr_lidx = lidx - 1;
        let pr_pidx = positions[pr_lidx];
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
        let pr_ex = PATTERNS.exits[bilayer.sub_patterns[pr_pidx]];
        let hr_en = PATTERNS.entrances[bilayer.sub_patterns[i]];
        if (pr_ex[0] != opposite_side(hr_en[0])) {
          console.error(
            "Subpatern exit/entrance ori mismatch: " + pr_ex + ">" + hr_en
          );
        }
        if (pr_ex[1] != hr_en[1]) {
          console.error(
            "Subpatern exit/entrance socket mismatch: " + pr_ex + ">" + hr_en
          );
        }
        if (lidx < positions.length - 1) {
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
      if (CHECK_GEN_INTEGRITY && exlu[xid] == undefined) {
        console.error("Undefined specific entrance/exit pattern space.");
        console.log(nid, xid);
      }
      result = exlu[xid].slice();
    } else { // specific entrance, nonspecific exit
      let matches = ec__eids(xc);
      for (let exid of matches) {
        let joint = exlu[exid];
        if (joint != undefined) {
          result = result.concat(joint);
        }
      }
    }
  } else { // nonspecific entrance
    let n_matches = ec__eids(nc);
    for (let enid of n_matches) {
      let exlu = lu[enid]; // exit lookup
      if (x_specific) { // but specific exit
        let joint = exlu[xid];
        if (join != undefined) {
          result = result.concat(joint);
        }
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
  let center = Math.floor(PATH_LENGTH / 2);
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
  [ "blend_color:0", blend_color("#000000ff", "#ffffffff", 0.5), "#7f7f7fff"],
  [ "same:0", same([4, 4], [4, 4]), true],
  [ "same:1", same([4, 4], [5, 5]), false],
  [ "edge_seed:0", edge_seed([17, 1, [4]], 2), edge_seed([17, 1, [9]], 0) ],
  [ "edge_seed:1", edge_seed([17, 1, [1]], 0), edge_seed([17, 2, [7, 21]], 2) ],
  [ "orientation_at", orientation_at([17, 0, []]), undefined ],
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
  [
    "common_parent:0",
    common_parent([17, 0, [13]], [17, 1, [13, 2]]),
    [ [17, 2, [12]], 12, 13 ]
  ],
  [
    "common_parent:1",
    common_parent([17, 1, [13, 2]], [17, 0, [13]]),
    [ [17, 2, [12]], 13, 12 ]
  ],
  [ "is_inside:0", is_inside([17, 3, [4, 8]], [17, 3, [4, 8, 12, 4]]), true ],
  [ "is_inside:1", is_inside([17, 3, [12, 12, 7]], [17, 1, [7, 1]]), true ],
  [ "is_inside:2", is_inside([17, 3, [12, 12, 7]], [17, 1, [7]]), false ],
  [ "is_inside:3", is_inside([17, 3, [12, 12, 7]], [17, 1, [8]]), false ],
  [ "is_inside:4", is_inside([17, 1, [7]], [17, 1, [7]]), false ],
  [ "is_inside:5", is_inside([17, 1, [7]], [17, 2, [12, 7]]), false ],
  [ "is_inside:6", is_inside([17, 1, [7]], [17, 3, [12, 12, 7, 1]]), true ],
];

LATE_TESTS = [
  [
    "direction_towards:0",
    [direction_towards, [[37198417, 1, [13, 2]], [37198417, 0, [13]]]],
    [direction_towards, [[37198417, 1, [8, 22]], [37198417, 0, [13]]]]
  ],
  [
    "distance_to:0",
    [distance_to, [ [19283, 1, [16, 13]], [19283, 1, [15, 4]] ]],
    [x => x, [18] ]
  ],
  [
    "distance_to:1",
    [distance_to, [ [19283, 1, [16, 18]], [19283, 1, [15, 4]] ]],
    [x => x, [19] ]
  ],
  [
    "distance_to:2",
    [distance_to, [ [16481, 1, [11, 23]], [16481, 1, [11, 10]] ]],
    [x => x, [7] ]
  ],
  [
    "distance_to:3",
    [distance_to, [ [16481, 1, [11, 24]], [16481, 1, [11, 10]] ]],
    [x => x, [12] ]
  ],
  [
    "distance_to:4",
    [distance_to, [ [16481, 1, [16, 4]], [16481, 1, [11, 10]] ]],
    [x => x, [13] ]
  ],
  [
    "distance_to:5",
    [distance_to, [ [16481, 1, [16, 3]], [16481, 1, [11, 10]] ]],
    [x => x, [16] ]
  ],
];

function same(a, b) {
  if (Array.isArray(a)) {
    if (Array.isArray(b)) {
      if (a.length != b.length) {
        return false;
      }
      for (var i = 0; i < a.length; ++i) {
        if (!same(a[i], b[i])) {
          return false;
        }
      }
      return true;
    } else {
      return false;
    }
  } else if (typeof a === "object") {
    if (typeof b === "object") {
      // keys & values match:
      for (var k in a) {
        if (a.hasOwnProperty(k)) {
          if (!b.hasOwnProperty(k)) {
            return false;
          }
          if (!same(a[k], b[k])) {
            return false;
          }
        }
      }
      // extra keys in b?
      for (var k in b) {
        if (b.hasOwnProperty(k)) {
          if (!a.hasOwnProperty(k)) {
            return false;
          }
        }
      }
      return true;
    } else {
      return false;
    }
  } else {
    return a === b;
  }
}

function keep_testing(tests) {
  let unresolved = [];
  for (let i in tests) {
    let t = tests[i];
    let name = t[0];
    let fv1 = t[1];
    let f1 = fv1[0];
    let a1 = fv1[1];
    let fv2 = t[2];
    let f2 = fv2[0];
    let a2 = fv2[1];

    let v1 = f1(...a1);
    let v2 = f2(...a2);

    if (v1 == undefined || v2 == undefined) {
      unresolved.push(t);
      continue;
    } else if (!same(v1, v2)) {
      console.error("Late Test '" + name + "' (#" + i + ") failed.");
      console.log("Expected:");
      console.log(v2);
      console.log("Got:");
      console.log(v1);
      FAILED = true;
    }
  }
  if (unresolved.length > 0) {
    window.setTimeout(keep_testing, TEST_DELAY, unresolved);
  } else {
    if (FAILED) {
      console.log("Late tests done failing.");
    } else {
      console.log("Late tests all passed.");
    }
  }
}

var FAILED = false;
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
    FAILED = true;
  }
}

keep_testing(LATE_TESTS)

// --------------------
// Onload Functionality
// --------------------

// Run when the document is loaded unless a test failed:
if (!FAILED) {
  window.onload = function () {
    // Start pattern-loading process immediately
    load_patterns();

    // Grab canvas & context:
    let canvas = document.getElementById("labyrinth");
    CTX = canvas.getContext("2d");

    // Set initial canvas size & scale:
    update_canvas_size(canvas, CTX);
    set_mode('grid');
    set_scale(CTX, 1);
    set_origin(CTX, [0, 0]);
    set_destination(CTX, [0, 0]);

    // Set up trails:
    CTX.trails = [
      {"seed": 19283, "alt_seed": 16481, "color": PALETTE[0], "positions": []},
      {"seed": 74982, "alt_seed": 75818, "color": PALETTE[1], "positions": []},
      {"seed": 57319, "alt_seed": 57284, "color": PALETTE[2], "positions": []},
      {"seed": 37198, "alt_seed": 37417, "color": PALETTE[3], "positions": []},
      {"seed": 28391, "alt_seed": 24864, "color": PALETTE[4], "positions": []},
      {"seed": 88172, "alt_seed": 85728, "color": PALETTE[5], "positions": []},
      {"seed": 91647, "alt_seed": 97418, "color": PALETTE[6], "positions": []},
      {"seed": 48108, "alt_seed": 47589, "color": PALETTE[7], "positions": []},
      {"seed": 61749, "alt_seed": 63411, "color": PALETTE[8], "positions": []},
      {"seed": 10719, "alt_seed": 10409, "color": PALETTE[9], "positions": []},
    ];
    for (let tr of CTX.trails) {
      tr.positions.push([0, 0]);
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

    // Clicking (or tapping) sets destination:
    canvas.onclick = function (ev) {
      handle_tap(CTX, ev);
    }

    // Draw every frame
    window.requestAnimationFrame(draw_frame);

    // Kick off generation subsystem
    gen_step();

    // Kick of trails subsystem
    advance_trails(CTX);

    // Kick off destination advance for grid modes
    advance_destination(CTX);

    // Kick off destination scrambling
    scramble_destination(CTX);

    // Kick off grid swapping
    swap_grids(CTX);
  };
}
