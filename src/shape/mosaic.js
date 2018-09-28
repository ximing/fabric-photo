import {fabric} from 'fabric';
// var cacheProperties = fabric.Object.prototype.cacheProperties.concat();
// cacheProperties.push('_mosaicRects');
const Mosaic = fabric.util.createClass(fabric.Object, {

    type: 'mosaic',
    // statefullCache:true,
    // cacheProperties:cacheProperties,
    // objectCaching: true,
    objectCaching:false,

    initialize: function(options) {

        options || (options = {});

        this._minPoint = {left:0,top:0};

        this._maxPoint = {left:0,top:0};

        this._mosaicRects = [];

        this.callSuper('initialize', options);

        this.addMosicRectWithUpdate(options.mosaicRects || []);
    },

    toObject: function() {
        return fabric.util.object.extend(this.callSuper('toObject'), {
            _mosaicRects: this.get('_mosaicRects')
        });
    },

    _render: function(ctx) {
        this._mosaicRects.forEach((item,i)=>{
            ctx.fillStyle = item.fill;
            ctx.fillRect(item.left, item.top, item.dimensions, item.dimensions);
        });
    },

    addMosaicRect: function(objects) {
        objects.forEach((object)=>{
            if(object.left < this._minPoint.left || object.top < this._minPoint.top) {
                this._minPoint = {
                    left:object.left,
                    top:object.top
                };
            }
            if(object.left > this._maxPoint.left || object.top > this._maxPoint.top) {
                this._maxPoint = {
                    left:object.left,
                    top:object.top
                };
            }
            this._mosaicRects.push({
                left:object.left,
                top:object.top,
                dimensions:object.dimensions,
                fill:object.fill
            });
        });
    },

    addMosicRectWithUpdate: function (objects) {
        this.addMosaicRect(objects);
        this.set({
            width: this._maxPoint.left - this._minPoint.left,
            height: this._maxPoint.top - this._minPoint.top,
            left:this._minPoint.left,
            top:this._minPoint.top,
            selectable:false
        });
    }
});
export default Mosaic;
