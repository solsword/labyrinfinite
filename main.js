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
// pattern coordinate isn't on an edge (but rounds non-socket edge coordinates
// to the lesser socket they're between).
function pc__ec(pc, horizonal) {
  let vertical = !horizonal;
  if (pc[0] == 0) { // top row
    if (pc[1] == 0 && vertical) { // left edge top
      return [ 3, 0 ];
    } else if (pc[1] == PATTERN_SIZE - 1 && vertical) { // right edge top
      return [ 1, 0 ];
    } else { // top edge
      return [ 0, Math.floor(pc[1]/2) ];
    }
  } else if (pc[0] == PATTERN_SIZE - 1) {
    if (pc[1] == 0 && vertical) { // left edge bottom
      return [ 3, PATTERN_SIZE - 1 ];
    } else if (pc[1] == PATTERN_SIZE - 1 && vertical) { // right edge bottom
      return [ 1, PATTERN_SIZE - 1 ];
    } else { // bottom edge
      return [ 2, Math.floor(pc[1]/2) ];
    }
  } else { // must be on a vertical (left or right) edge; not on a corner
    if (pc[1] == 0) {
      return [ 3, Math.floor(pc[0]/2) ];
    } else if (pc[1] == PATTERN_SIZE - 1) {
      return [ 1, Math.floor(pc[0]/2) ];
    } else { // not on an edge
      return undefined;
    }
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

// --------------
// Labyrinth Code
// --------------

j

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
  // Takes a raw patterns list and organizes it according to the input/output
  // cells of each pattern. The incoming pattern list should list all patterns
  // from left-side entrances to top, right, and bottom-side exits, without
  // containing any rotations (but with reflections across the horizontal).
  // Patterns are simply lists of indices covering 0 .. N^2-1, indicating the
  // order in which cells in a square are visited.
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
  let by_entrance = {};
  let by_exit = {};

  for (let p of patterns) {
    // TODO: HERE
  }

  return {
    "patterns": patterns,
    "by_entrance": by_entrance,
    "by_exit": by_exit,
  }
}
