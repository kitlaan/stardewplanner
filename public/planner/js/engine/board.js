/**
 * Created by Henrik Peinar on 01/04/16
 */

'use strict';

/**
 * Board constructor
 * @param containerId
 * @param width
 * @param height
 * @returns {Board}
 * @constructor
 */

function Board (containerId, width, height) {
    this.R = Snap(containerId);

    this.width = width;
    this.height = height;
    this.tileSize = 16;
    this.tiles = [];
    this.buildings = [];
    this.grid = null;
    this.background = this.R.image(Board.toFullPath('img/full_background.jpg'), 0, 0, width, height);
    this.brush = new Brush(this);
    this.keepHighlights = [];
    this.placingBuilding = null;

    this.restrictionCheck = true;

    this.restrictedPath = [
        'M0,0L640,0L640,128L560,128L560,96L544,96L544,128L64,128L64,144L48,144L48,368L112,368L112,544L80,544L80,560L64,560L64,576L48,576L48,992L640,992L640,1040L0,1040z', // left side
        'M672,0L672,128L736,128L736,112L768,112L768,128L784,128L784,112L848,112L848,144L880,144L880,160L1200,160L1200,176L1232,176L1232,160L1248,160L1248,176L1232,176L1232,192L1248,192L1248,240L1280,240L1280,0z', // top right
        'M1232,304L1232,896L1168,896L1168,944L1104,944L1104,992L672,992L672,1040L1280,1040L1280,304z', // bottom right
        'M400,160L512,160L512,256L400,256z', // greenhouse
        'M944,176L1088,176L1088,256L1104,256L1104,272L944,272z', // house
        'M1136,224L1168,224L1168,240L1136,240z', // ship box
        'M1120,448L1200,448L1200,464L1216,464L1216,528L1200,528L1200,544L1136,544L1136,528L1120,528L1120,448z', // little pond
        'M576,784L688,784L688,800L704,800L704,816L736,816L736,832L752,832L752,896L736,896L736,912L720,912L720,928L672,928L672,944L592,944L592,928L576,928L576,912L544,912L544,880L528,880L528,832L544,832L544,816L560,816L560,800L576,800L576,784z' // big pond
    ].join('');

    // TODO: actually use correct path
    this.restrictedBuildingArea = this.R.path(this.restrictedPath);
    this.restrictedBuildingArea.attr({
        fill: 'none',
        stroke: 'red'
    });

    this.positionHelpers = [this.R.text(0, 30, 'X: 0').attr({fill: 'white', pointerEvents: 'none', opacity: 0}), this.R.text(0, 15, 'Y: 0').attr({fill: 'white', pointerEvents: 'none', opacity: 0})];
    this.ghostPath = null; // used for debugging...
    this.pathPoints = []; // used for debugging...

    this.drawGrid();
    this.drawHelpers();
    this.preDrawSprites();

    this.R.mousemove(this.mousemove.bind(this));

    // yes... same event name
    this.R.mouseup(this.mousedown.bind(this));

    // bind keybinds to window
    $(window).keydown(this.keydown.bind(this));

    this.R.drag(this.dragMove, this.dragStart, this.dragEnd, this, this, this);

    return this;
}

Board.prototype.showHighlights = function showHighlights(type) {
    var board = this;

    if (type && board.keepHighlights.indexOf(type) === -1) {
        board.keepHighlights.push(type);
    }

    board.buildings.forEach(function (building) {
        if (board.keepHighlights.indexOf(building.typeGroup) !== -1) {
            building.moveHighlight();
        }
    });





};

Board.prototype.hideHighlights = function hideHighlights(type) {
    var board = this;
    var index = board.keepHighlights.indexOf(type);
    if (index >= 0) {
        board.keepHighlights.splice(board.keepHighlights.indexOf(type), 1);

        board.buildings.forEach(function (building) {
            if (building.highlight && board.keepHighlights.indexOf(building.typeGroup) === -1) {
                building.highlight.attr('opacity', 0);
            }
        });
    }
};

Board.prototype.drawHelpers = function drawHelpers() {
    var helperAttr = {
        fill: 'none',
        pointerEvents: 'none',
        stroke: '#000',
        strokeWidth: 0.5,
        opacity: 1
    };

    this.helperX = this.R.rect(0, 0, this.width, this.tileSize);
    this.helperY = this.R.rect(0, 0, this.tileSize, this.height);

    this.helperX.attr(helperAttr);
    this.helperY.attr(helperAttr);
};

Board.prototype.moveHelpers = function moveHelpers(pos) {
    this.helperX.attr({
        y: pos.y
    });
    this.helperY.attr({
        x: pos.x
    });
};

/**
 * Deselects building
 */
Board.prototype.deselectBuilding = function deselectBuilding() {
    var board = this;
    if (board.placingBuilding) {
        board.removeBuilding(board.placingBuilding);
        board.placingBuilding = null;
    }
};

/**
 * Deletes building from the buildings list
 * @param building
 */
Board.prototype.removeBuilding = function removeBuilding(building) {
    var board = this;
    var bIndex = board.buildings.map(function (b) { return (b || {}).uuid; }).indexOf((building || {}).uuid);
    board.buildings.splice(bIndex, 1);

    if (building.highlight) {
        building.highlight.remove();
    }

    building.remove();

    if ((board.placingBuilding || {}).uuid === building.uuid) {
        board.placingBuilding = null;
    }
    window.dispatchEvent(new Event('updateCount'));
};

/**
 * Starts placing building ("picks" it up)
 * @param id
 * @param building
 * @param x
 * @param y
 */
Board.prototype.placeBuilding = function placeBuilding(id, building, x, y) {
    var board = this;

    if (building && board.brush.erase) {
        board.removeBuilding(building);
        return;
    }

    if (!building) {
        this.deselectBuilding();
        building = new Building(this, id, (x || 0), (y || 250), true);
    }

    board.brush.changeBrush('select');
    board.placingBuilding = building;
};

/**
 * Brings all buildings to top (uses toBack because it is reverted for snapsvg plugin)
 */
Board.prototype.buildingsToTop = function buildingsToTop(e) {
    // hold buildings on top
    this.buildings.forEach(function (b) {
        if (b) {
            b.sprite.toBack();
        }
    });
    this.buildings.forEach(function (b) {
        if (b.highlight) {
            b.highlight.toBack();
        }
    });

    this.helperX.toBack();
    this.helperY.toBack();
    this.brush.rect.toBack();
};


/**
 * Handles darg start, if building placing is in action, cancles drag
 * @param x
 * @param y
 * @param e
 */
Board.prototype.dragStart = function dragStart(x, y, e) {
    this.brush.lock();
};

/**
 * Handles drag move event
 * @param dx
 * @param dy
 * @param x
 * @param y
 * @param e
 */
Board.prototype.dragMove = function dragMove(dx, dy, x, y, e) {
    if (this.brush.freemode) {
        var pos = Board.normalizePos(e, this.background.node, this.tileSize);
        this.drawTile(pos, this.brush.type);
    } else {
        this.brush.drag(this.snap(Board.normalizePos(e, this.background.node)));
    }
};

/**
 * Handles dragEnd event
 * @param e
 */
Board.prototype.dragEnd = function dragEnd(e) {
    this.brush.move(this.snap(Board.normalizePos(e, this.background.node)));
    this.brush.unlock();

    // check if rect happens to be inside of restricted area
    if ($(e.target).data('custom-type') !== 'building' && (!this.brush.type || !this.checkRestriction(this.restrictedBuildingArea, this.brush.rect))) {
        this.drawTiles(this.brush.rect, this.brush.type);
    }

    this.brush.reset();
    this.buildingsToTop();
};

/**
 * Handles board mousedown event
 * @param e
 */
Board.prototype.mousedown = function mousedown(e) {
    var board = this;

    if (board.placingBuilding) {

        if(this.checkRestriction(this.restrictedBuildingArea, this.placingBuilding.sprite)) {
            this.removeBuilding(this.placingBuilding);
            return;
        }
        var bIndex = board.buildings.map(function (b) { return (b || {}).uuid; }).indexOf((board.placingBuilding || {}).uuid);
        var pos = Board.normalizePos(e, null, board.tileSize);
        var buildingId = board.placingBuilding.type;

        board.placingBuilding.move(pos);
        board.placingBuilding.putDown();
        if (bIndex === -1) {
            board.buildings.push(board.placingBuilding);
        }

        board.placingBuilding = null;

        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            setTimeout(function () {
                board.placeBuilding(buildingId, null, pos.x, pos.y);
            }, 1);
            e.preventDefault();
        } else {
            board.brush.restoreBrush();
        }
        window.dispatchEvent(new Event('updateCount'));
    }
};

/**
 * Checks if element bbox intersects with path
 * @param restrictedArea
 * @param element
 * @returns {*}
 */
Board.prototype.checkPathRestriction = function checkPathRestriction (restrictedArea, element) {
    var bb = element.getBBox();
    // you might ask WHY?! but there is a good reason we down-scale the path here:
    // we don't want edge-to-edge collisions to be detected, so we make the actual testing path smaller
    var matrix = (Snap.matrix()).scale(0.98, 0.98, bb.x + bb.width / 2, bb.y + bb.height / 2);

    // also we're going to draw extra paths for even better collision detection
    var s = {
        x: bb.x + 4,
        y: bb.y + 4,
        x2: bb.x + bb.width - 4,
        y2: bb.y + bb.height - 4
    };

    var extraPaths = [
        ['M'+ s.x, s.y +'L'+ (s.x2), (s.y2) +'z'],
        ['M'+ (s.x2), (s.y) +'L'+ (s.x), (s.y2) +'z'],
        ['M'+ (s.x + bb.width / 2) , (s.y) +'L'+ (s.x + bb.width / 2), (s.y2) +'z']
    ];
    var transformPath = Snap.path.map(bb.path.toString(), matrix);
    transformPath += extraPaths.join('');

    return Snap.path.intersection(restrictedArea, transformPath.toString()).length > 0;
};

/**
 * Checks if rect is in restrictionPath or not
 * @param restrictionPath
 * @param rect
 */
Board.prototype.checkRestriction = function checkRestriction (restrictionPath, rect) {
    if (!this.restrictionCheck) {
        return false;
    }

    var data = {};
    if (rect.type) {
        data = {
            x: +rect.attr('x') + 1,
            y: +rect.attr('y') + 1,
            width: +rect.attr('width') - 2,
            height: +rect.attr('height') - 2
        };
    } else {
        data = {
            x: +rect.x + 1,
            y: +rect.y + 1,
            width: +rect.width - 2,
            height: +rect.height - 2
        };
    }

    var points = [
        { x: data.x, y: data.y},
        { x: data.x + data.width, y: data.y},
        { x: data.x, y: data.y + data.height},
        { x: data.x + data.width, y: data.y + data.height}
    ];

    return points.some(function (p) {
        return Snap.path.isPointInside(restrictionPath, p.x, p.y);
    });
};

/**
 * Handles mouse movement over the background (considered to be our "canvas")
 * @param e
 */
Board.prototype.mousemove = function mousemove(e) {
    if (this.placingBuilding) {

        if(this.checkRestriction(this.restrictedBuildingArea, this.placingBuilding.getBBox())) {
            // sorry, can't build here
            // TODO: I like red. Try to figure out how to use red here
            this.placingBuilding.sprite.attr({
                opacity: .2
            });
        } else {
            // build away
            this.placingBuilding.sprite.attr({
                opacity: .7
            });
        }

        this.placingBuilding.move(Board.normalizePos(e, null, this.tileSize));
    }

    // show pos
    var snappedPos = Board.normalizePos(e, null, this.tileSize);
    this.positionHelpers[0].attr({
        'text': 'Y: '+ (+snappedPos.y / this.tileSize),
        'y': snappedPos.y - 16,
        'x': snappedPos.x - 3*16
    }).toBack();
    this.positionHelpers[1].attr({
        'text': 'X: '+ (+snappedPos.x / this.tileSize),
        'y': snappedPos.y,
        'x': snappedPos.x - 3*16
    }).toBack();


    //move the brush
    this.brush.move(snappedPos);

    // move helpers
    this.moveHelpers(snappedPos);
};

/**
 * Handles key presses
 * @param e
 */
Board.prototype.keydown = function keydown(e) {
    // 'Del'
    if (this.placingBuilding && e.which == 46) {
        this.deselectBuilding();
    }

    // 'E'
    if (e.which === 69) {
        if (this.placingBuilding) {
            this.deselectBuilding();
        }

        if (!this.brush.erase) {
            this.brush.changeBrush('eraser');
        } else {
            this.brush.restoreBrush();
        }
    }

    // 'Esc'
    if (e.which === 27) {
        if (this.placingBuilding) {
            this.deselectBuilding();
            this.brush.restoreBrush();
        }

        this.brush.unlock();
        this.brush.reset();
    }

    e.stopPropagation();
};

/**
 * Snaps the given x,y obj to closest point
 * @param pos
 */
Board.prototype.snap = function snap(pos) {
    return {
        x: Math.floor(pos.x / this.tileSize) * this.tileSize,
        y: Math.floor(pos.y / this.tileSize) * this.tileSize
    }
};

/**
 * Normalizes position for all browsers
 * @param e
 * @newTarget
 * @snap
 * @returns {{x: number, y: number}}
 */
Board.normalizePos = function normalizePos(e, newTarget, snap) {
    var target = (newTarget || e.currentTarget);
    var rect = target.getBoundingClientRect();
    var offsetX = e.clientX - rect.left;
    var offsetY = e.clientY - rect.top;

    if (snap) {
        offsetX = Math.floor(offsetX / snap) * snap;
        offsetY = Math.floor(offsetY / snap) * snap;
    }

    return {
        x: offsetX,
        y: offsetY
    }
};

/**
 * Draws tiles to given area or location
 * @param area {R.rect|{x,y}}
 * @param tile
 */
Board.prototype.drawTiles = function drawTiles(area, tile) {
    // first we check path restriction
    if (this.brush.type && this.checkPathRestriction(this.restrictedBuildingArea, area)) {
        return;
    }

    // we are drawing to an area (most likely from a brush)
    if (area.type === 'rect') {

        // Note: Could draw areas of tiles as rects with fill to url(#)
        // but then there is problem with deleting them

        var areaData = {
            x: +area.attr('x'),
            y: +area.attr('y'),
            width: +area.attr('width'),
            height: +area.attr('height')
        };

        // loop this area and draw tiles on every square
        for (var y = areaData.y;y < areaData.y + areaData.height;y += this.tileSize) {
            for (var x = areaData.x;x < areaData.x + areaData.width;x += this.tileSize) {
                this.drawTile({
                    x: x,
                    y: y
                }, tile);
            }
        }

        window.dispatchEvent(new Event('updateCount'));
        return;
    }

    // not area, just draw this one tile to location
    this.drawTile(area, tile);
    window.dispatchEvent(new Event('updateCount'));
};

/**
 * Draws tile to given location, also does all the checking work
 * @param location
 * @param tile
 * @param force
 * @return {*}
 */
Board.prototype.drawTile = function drawTile(location, tile, force = false) {
    var hardX = location.x / this.tileSize;
    var hardY = location.y / this.tileSize;

    if (!this.tiles[hardY]) {
        this.tiles[hardY] = [];
    }

    if (tile === 'select') {
        return;
    }

    var specialtile = tile;
    if (tile && tile.endsWith('fence')) {
        var hasAbove = this.tiles[hardY-1] && this.tiles[hardY-1][hardX] &&
                       this.tiles[hardY-1][hardX].attr('tileType') === tile;
        var hasBelow = this.tiles[hardY+1] && this.tiles[hardY+1][hardX] &&
                       this.tiles[hardY+1][hardX].attr('tileType') === tile;
        var hasLeft  = this.tiles[hardY] && this.tiles[hardY][hardX-1] &&
                       this.tiles[hardY][hardX-1].attr('tileType') === tile;
        var hasRight = this.tiles[hardY] && this.tiles[hardY][hardX+1] &&
                       this.tiles[hardY][hardX+1].attr('tileType') === tile;

        // TODO: this can probably be better done as a 2d array?
        if (hasLeft && hasRight) {
            if (hasAbove && hasBelow) {
                specialtile = tile + '--p';
            } else if (hasAbove) {
                specialtile = tile + '--tu';
            } else if (hasBelow) {
                specialtile = tile + '--td';
            }
        } else if (hasAbove && hasBelow) {
            if (hasLeft) {
                specialtile = tile + '--tl';
            } else if (hasRight) {
                specialtile = tile + '--tr';
            } else {
                specialtile = tile + '--v';
            }
        } else if (hasAbove && hasRight) {
            specialtile = tile + '--ur';
        } else if (hasAbove && hasLeft) {
            specialtile = tile + '--ul';
        } else if (hasBelow && hasRight) {
            specialtile = tile + '--dr';
        } else if (hasBelow && hasLeft) {
            specialtile = tile + '--dl';
        } else if (hasAbove || hasBelow) {
            specialtile = tile + '--v';
        }
    }

    console.log('drawing ' + hardX + ',' + hardY + ': ' + specialtile);
    if (this.tiles[hardY][hardX]) {
        console.log('exist ' + hardX + ',' + hardY + ': ' + this.tiles[hardY][hardX].attr('tileCustom'));
        if (!this.brush.erase && this.tiles[hardY][hardX].attr('tileCustom') === specialtile) {
            // same tile? don't bother
            return;
        }

        // there seems to be a tile in place here already, remove it

        if (!this.brush.overwriting && !this.brush.erase && !force) {
            return;
        } else {
            this.tiles[hardY][hardX].remove();
            this.tiles[hardY][hardX] = null;

            // make sure to only recurse once!
            if (!force) {
                this.redrawSurroundingTiles(location, tile);
            }

            // TODO: this is soooo wrong: overloading force and erase
            // I think we need to separate out the logic...
            if (this.brush.erase && !force) {
                return;
            }
        }
    }

    if (specialtile) {
        var newTile = this.R.use(specialtile);
        newTile.attr({
            x: location.x,
            y: location.y,
            tileType: tile,
            tileCustom: specialtile,
            pointerEvents: 'none'
        });

        this.tiles[hardY][hardX] = newTile;

        // make sure to only recurse once!
        if (!force) {
            this.redrawSurroundingTiles(location, tile);
        }

        return newTile;
    }
};

/**
 * Redraws tiles around a given location
 * @param location
 * @param tile
 * @return {*}
 */
Board.prototype.redrawSurroundingTiles = function redrawSurroundingTiles(location, tile) {
    // the only tiles that need checking are fences (or eraser)
    if (tile && !tile.endsWith('fence')) {
        return;
    }

    var hardX = location.x / this.tileSize;
    var hardY = location.y / this.tileSize;

    var board = this;

    [-1, 0, +1].forEach(function (offY) {
        [-1, 0, +1].forEach(function (offX) {
            // only check adjacent tiles (not diagonal)
            if ((offX == 0) != (offY == 0)) {
                var hardXX = hardX + offX;
                var hardYY = hardY + offY;

                if (board.tiles[hardYY] && board.tiles[hardYY][hardXX]) {
                    var tiletype = board.tiles[hardYY][hardXX].attr('tileType');
                    if (!tile && tiletype.endsWith('fence') || tiletype === tile) {
                        board.drawTile({
                            x: hardXX * board.tileSize,
                            y: hardYY * board.tileSize
                        }, tiletype, true);
                    }
                }
            }
        });
    });
};


/**
 * Draws grid. This is just to visually ease planning
 * Uses path tag in pattern tag and full width/height rect to fill the grid. Disables mouseEvents on the fill rect
 */
Board.prototype.drawGrid = function drawGrid() {
    var oneGridBlock = this.R.path('M 16 0 L 0 0 0 16');

    oneGridBlock.attr({
        fill: 'none',
        stroke: 'grey',
        strokeWidth: .5
    });

    var pattern = oneGridBlock.toPattern(0, 0, 16, 16);
    pattern.attr({
        id: 'grid'
    });

    this.grid = this.R.rect(0, 0, this.width, this.height);
    this.grid.attr({
        fill: 'url(#grid)',
        pointerEvents: 'none'
    });
};

/**
 * Inserts all our sprites to defs
 */
Board.prototype.preDrawSprites = function preDrawSprites() {
    data.tiles.forEach(function (tile) {
        var tileImage = this.R.image(Board.toFullPath('img/tiles/'+ tile +'.png'), 0, 0, this.tileSize, this.tileSize);
        tileImage.attr({
            id: tile
        });

        tileImage.toDefs();
    }.bind(this));

    Object.keys(data.buildings).forEach(function (b) {
        var building = data.buildings[b];
        var buildingImage = this.R.image(Board.toFullPath(building.sprite), 0, 0, building.width, building.height);
        buildingImage.attr({
            id: b
        });


        buildingImage.toDefs();
    }.bind(this));
};

/**
 * Exports data to JSON string
 */
Board.prototype.exportData = function exportData() {
    var farmData = {
        tiles: [],
        buildings: []
    };

    this.tiles.forEach(function (yTiles) {
        yTiles.forEach(function (tile) {
            if (tile) {
                var tileData = {
                    type: tile.attr('tileType'),
                    y: tile.attr('y'),
                    x: tile.attr('x')
                };

                if (tileData) {
                    farmData.tiles.push(tileData);
                }
            }
        });
    });

    this.buildings.forEach(function (building) {
        if (!building) {
            return;
        }

        var buildingData = building.convertToData();

        if (buildingData && buildingData.x && buildingData.y) {
            farmData.buildings.push(buildingData);
        }
    });

    return farmData;
};

/**
 * Imports farm data
 * @param data
 * @param cb
 */
Board.prototype.importData = function importData(data, cb) {
    if (!data) {
        return;
    }

    var board = this;
    var farmData = data;

    // import buildings
    farmData.buildings.forEach(function (building) {
        // don't import buildings on 0,0
        if (building.x > 0 || building.y > 0) {
            board.buildings.push(new Building(board, building.type, building.x, building.y))
        }
    });

    // import tiles
    farmData.tiles.forEach(function (tile) {
        board.drawTile(tile, tile.type);
    });

    // draw buildings on tops
    this.buildingsToTop();

    // show highlights
    this.showHighlights();

    if (typeof cb === 'function') {
        cb();
    }

    if (typeof cb === 'function') {
        cb();
    }

    window.dispatchEvent(new Event('updateCount'));
};

/**
 * Clears the board
 */
Board.prototype.clear = function clear() {
    var board = this;

    this.tiles.forEach(function (cTiles) {
        if (cTiles) {
            cTiles.forEach(function (tile) {
                tile.remove();
            });
        }
    });

    this.tiles = [];

    this.buildings.forEach(function (building) {
        building.sprite.remove();

        if(building.highlight) {
            building.highlight.remove();
        }

    });

    this.buildings = [];
};

/**
 * Well, you wouldn't believe it, but this function hides stuff
 */
Board.prototype.hideStuff = function hideStuff() {
    var hideMe = {
        opacity: 0
    };

    this.modifiyStuff(hideMe);
};

/**
 * And this function shows the same stuff that was hidden
 */
Board.prototype.showStuff = function showStuff() {
    var showMe = {
        opacity: 1
    };

    this.modifiyStuff(showMe);
};

Board.prototype.modifiyStuff = function modifyStuff(attr) {
    this.helperY.attr(attr);
    this.helperX.attr(attr);
    this.grid.attr(attr);
    this.restrictedBuildingArea.attr(attr);
};

/**
 * Show coordinates
 */
Board.prototype.showCoords = function showCoords() {
    this.positionHelpers.forEach(function (h) {
        h.attr('opacity', 1);
    });
};

/**
 * Hide coordinates
 */
Board.prototype.hideCoords = function hideCoords() {
    this.positionHelpers.forEach(function (h) {
        h.attr('opacity', 0);
    });
};

/**
 * Converts relative path to absolute (this is needed to be able to save SVG's as images)
 * @param relativePath
 * @returns {string}
 */
Board.toFullPath = function toFullPath(relativePath) {
    return window.location.origin + window.location.pathname + relativePath;
};

/**
 * Generates unique uuid
 * @returns {string}
 */
Board.generateGUID = function generateGUID() {
    var S4 = function() {
        return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
};

/**
 * Little plugin for snap to support toFront / toBack
 */
Snap.plugin(function (Snap, Element, Paper, glob) {
    var elproto = Element.prototype;
    elproto.toFront = function () {
        this.prependTo(this.paper);
    };
    elproto.toBack = function () {
        this.appendTo(this.paper);
    };
});
