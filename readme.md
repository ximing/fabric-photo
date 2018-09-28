## fabric photo
### 启动demo
```bash
# 安装依赖
npm run i
# 运行项目
npm run dev
```

基于canvas的纯前端的图片编辑器，支持方形，圆形，箭头，缩放，拖拽，鹰眼，马赛克，涂鸦，线条，导出png，剪切等

![image.png](https://s3.meituan.net/v1/mss_814dc1610cda4b2e8febd6ea2c809db5/apps-open/27dab3fc-22d4-465b-85f6-7cfa8e3f7c50_1500805977973?filename=image.png)

结合react
```
class ImageUploaderDialog extends Component {
    constructor() {
        super();
        this.state = {
            editState: consts.states.NORMAL,
            left: 0,
            top: 0,
            arrow: {
                color: '#FF3440',
                stroke: 6
            },
            freeDraw: {
                color: '#FF3440',
                stroke: 6
            },
            text: {
                color: '#FF3440'
            },
            mosaic: {
                stroke: 8
            },
            cropArea: {
                top: 0,
                left: 0,
                width: 0,
                height: 0
            },
            zoom:1,
            originZoom:1,
            checkReset:false,
            sendImgLock:false
        };
        this.uploadFreeDrawEvent = false;
        this.onApplyCropBtn = this.onApplyCropBtn.bind(this);
        this.onCancleCropBtn = this.onCancleCropBtn.bind(this);
        this.sendImageFunc = this.sendImageFunc.bind(this);
        this.onArrowBtnClick = this.onArrowBtnClick.bind(this);
        this.onFreeDrawBtnClick = this.onFreeDrawBtnClick.bind(this);
        this.onTextBtnClick = this.onTextBtnClick.bind(this);
        this.onMosaicBtnClick = this.onMosaicBtnClick.bind(this);
        this.onRotationBtnClick = this.onRotationBtnClick.bind(this);
        this.onCropBtnClick = this.onCropBtnClick.bind(this);
        this.onPanBtnClick = this.onPanBtnClick.bind(this);
        this.onUndoBtn = this.onUndoBtn.bind(this);
        this.onRedoBtn = this.onRedoBtn.bind(this);
        this.onClearBtnClick = this.onClearBtnClick.bind(this);
        this.handleCloseUploadBubbleFileDialog = this.handleCloseUploadBubbleFileDialog.bind(this);
        this.changeZoom = this.changeZoom.bind(this);
        this.zoomIn = this.zoomIn.bind(this);
        this.zoomOut = this.zoomOut.bind(this);
        this.cancelReset = this.cancelReset.bind(this);
        this.checkReset = this.checkReset.bind(this);
        this.onWheel = this.onWheel.bind(this);
    }

    componentDidMount() {
        let {width, height} = this.getPreviewViewPort();
        window.fabricPhoto = this.fp = new FabricPhoto('#upload-file-image-preview', {
            cssMaxWidth: width,
            cssMaxHeight: height
        });
        this.fp.once('loadImage', (oImage) => {
            try {
                $('#upload-file-image-preview').css('background','none');
                let {width,cssWidth} = this.fp.getViewPortInfo().canvas;
                this.setState({
                    zoom:cssWidth / width,
                    originZoom:cssWidth / width
                });
                this.fp.clearUndoStack();
                this.fp.endAll();
                this.setState({
                    editState: consts.states.FREE_DRAWING
                });
                this.fp.startFreeDrawing({
                    width: this.state.freeDraw.stroke,
                    color: this.state.freeDraw.color
                });
            }catch (err) {
                console.error(err); //eslint-disable-line no-console
            }
        });
        this.fp.loadImageFromFile('imageurl or file obj', 'filename);
        this.fp.on({
            addObject:(obj)=>{
                if (obj.type === 'path' && obj.customType === 'freedraw' && !this.uploadFreeDrawEvent) {
                    this.uploadFreeDrawEvent = true;
                }
            },
            selectObject: (obj) => {
                if (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'triangle') {
                    this.setState({
                        editState: consts.states.SHAPE
                    });
                    this.activateShapeMode();
                } else if (obj.type === 'text') {
                    this.setState({
                        editState: consts.states.TEXT,
                        text: {
                            color: obj.fill || '#FF3440'
                        }
                    });
                    this.activateTextMode();
                } else if (obj.type === 'group') {
                    if (obj.customType === 'arrow') {
                        if(this.fp.getCurrentState() === consts.states.ARROW) {
                            return;
                        }
                        this.setState({
                            editState: consts.states.ARROW
                        });
                        this.fp.startArrowDrawing({
                            width: this.state.arrow.stroke,
                            color: this.state.arrow.color
                        });
                        this.fp.startArrowDrawing();
                    }
                } else if (obj.type === 'path') {
                    if (obj.customType === 'freedraw') {
                        // this.setState({
                        //     editState: consts.states.FREE_DRAWING
                        // });
                        // this.fp.startFreeDrawing({
                        //     width: this.state.freeDraw.stroke,
                        //     color: this.state.freeDraw.color
                        // });
                    }
                }
            },
            activateText: (obj) => {
                // add new text on cavas
                if (obj.type === 'new') {
                    this.fp.addText(' ', {
                        styles: {
                            fill: this.state.text.color,
                            fontSize: 50
                        },
                        position: obj.originPosition
                    },true);
                }
            },
            emptyUndoStack: () => {
                // $btnUndo.addClass('disabled');
                // resizeEditor();
            },
            emptyRedoStack: () => {
                // $btnRedo.addClass('disabled');
                // resizeEditor();
            },
            pushUndoStack: () => {
                // $btnUndo.removeClass('disabled');
                // resizeEditor();
            },
            pushRedoStack: () => {
                // $btnRedo.removeClass('disabled');
                // resizeEditor();
            },
            adjustObject: (obj, type) => {
                if (obj.type === 'text' && type === 'scale') {
                    //$inputFontSizeRange.val(obj.getFontSize());
                }
            },
            changeZoom: (nextZoom)=>{
                this.setState({
                    zoom:nextZoom
                });
            }
        });
    }

    componentWillUnmount() {
        if (this.fp) {
            this.fp.destroy();
            this.fp = null;
            $('#upload-file-image-preview').empty();
        }
    }

    componentDidUpdate(){
        let dom = ReactDOM.findDOMNode(this.refs.sendBtn);
        if(dom){
            dom.focus();
        }
    }


    getWindowViewPort() {
        return {
            height: $(window).height(),
            width: $(window).width()
        };
    }

    getDialogViewPort() {
        const {height, width} = this.getWindowViewPort();
        return {
            width: width < 680 ? 680 : width > 900 ? 900 : width,
            height: height < 450 ? 450 : height > 600 ? 600 : height
        };
    }

    getPreviewViewPort() {
        let {width, height} = this.getDialogViewPort();
        return {
            width: width,
            height: height - 64
        };
    }

    activateShapeMode() {
        if (this.fp.getCurrentState() !== consts.states.SHAPE) {
            this.fp.endFreeDrawing();
            this.fp.endTextMode();
            this.fp.endLineDrawing();
            this.fp.endMosaicDrawing();
            this.fp.endCropping();
            this.fp.endArrowDrawing();
            this.fp.endPan();
            this.fp.startDrawingShapeMode();
        }
    }

    activateTextMode() {
        if (this.fp.getCurrentState() !== consts.states.TEXT) {
            this.fp.endFreeDrawing();
            this.fp.endLineDrawing();
            this.fp.endArrowDrawing();
            this.fp.endMosaicDrawing();
            this.fp.endCropping();
            this.fp.endDrawingShapeMode();
            this.fp.endTextMode();
            this.fp.endPan();
            this.fp.startTextMode();
        }
    }

    zoomOut() {
        if(this.state.zoom >= 2) {
            return;
        }
        let nextZoom = Math.min(this.fp.getZoom() + 0.2,2);
        this.fp.setZoom(nextZoom);
        this.resetEditorState();
        this.onPanBtnClick();
        window.mta('count','zoom-out-click');
    }

    zoomIn() {
        if(this.state.zoom <= this.state.originZoom) {
            return;
        }
        let nextZoom = Math.max(this.fp.getZoom() - 0.2,this.state.originZoom);
        this.fp.setZoom(nextZoom);
        this.resetEditorState();
        this.onPanBtnClick();
        window.mta('count','zoom-in-click');
    }

    changeZoom(e) {
        if(e === this.state.zoom) {
            return;
        }
        let nextZoom = Math.max(Math.min(e,2),this.state.originZoom);
        this.fp.setZoom(nextZoom);
        this.resetEditorState();
        this.onPanBtnClick();
    }

    resetEditorState() {
        this.setState({
            editState: consts.states.NORMAL,
            checkReset:false
        });
    }

    onArrowBtnClick() {
        if (this.fp.getCurrentState() === consts.states.CROP) return;
        this.fp.endAll();
        if (this.state.editState === consts.states.ARROW) {
            this.resetEditorState();
        } else {
            this.setState({
                editState: consts.states.ARROW
            });
            this.fp.startArrowDrawing({
                width: this.state.arrow.stroke,
                color: this.state.arrow.color
            });
            window.mta('count','arrow-click');
        }
    }

    onFreeDrawBtnClick() {
        if (this.fp.getCurrentState() === consts.states.CROP) return;
        this.fp.endAll();
        if (this.state.editState === consts.states.FREE_DRAWING) {
            this.resetEditorState();
        } else {
            this.setState({
                editState: consts.states.FREE_DRAWING
            });
            this.fp.startFreeDrawing({
                width: this.state.freeDraw.stroke,
                color: this.state.freeDraw.color
            });
            window.mta('count','freedraw-click');
        }
    }

    onMosaicBtnClick() {
        if (this.fp.getCurrentState() === consts.states.CROP) return;
        this.fp.endAll();
        if (this.state.editState === consts.states.MOSAIC) {
            this.resetEditorState();
        } else {
            this.setState({
                editState: consts.states.MOSAIC
            });
            this.fp.startMosaicDrawing({
                dimensions: this.state.mosaic.stroke
            });
            window.mta('count','mosaic-click');
        }
    }

    onTextBtnClick() {
        if (this.fp.getCurrentState() === consts.states.CROP) return;
        if (this.fp.getCurrentState() === consts.states.TEXT) {
            this.fp.endAll();
            this.resetEditorState();
        } else {
            this.setState({
                editState: consts.states.TEXT
            });
            //this.activateTextMode();
            this.fp.endAll();
            this.fp.startTextMode();
            window.mta('count','text-click');
        }
    }

    onRotationBtnClick() {
        if (this.fp.getCurrentState() === consts.states.CROP) return;
        this.fp.endAll();
        this.fp.rotate(90);
        this.resetEditorState();
        window.mta('count','rotation-click');
    }

    onCropBtnClick() {
        if (this.fp.getCurrentState() === consts.states.CROP) {
            this.fp.endAll();
            this.resetEditorState();
        } else {
            this.fp.endAll();
            this.fp.startCropByBoundInfo();
            let cropData = this.fp.getViewPortImage(),
                cropArea = {
                    top: 0,
                    left: 0,
                    width: cropData.viewPortInfo.width,
                    height: cropData.viewPortInfo.height
                };
            this.setState({
                editState: consts.states.CROP,
                cropData: cropData,
                cropArea: cropArea
            });
            // this.fp.startCropping();
            window.mta('count','crop-click');
        }
    }

    onClearBtnClick() {
        this.fp.once('clearObjects',()=>{
            if(this.fp.getAngle()!==0){
                this.fp.setAngle(0);
            }
            this.fp.clearRedoStack();
            this.fp.clearUndoStack();
        })
        this.fp.clearObjects();
        this.resetEditorState();
        this.fp.adjustCanvasDimension();
        this.fp.endAll();
        window.mta('count','reset-click');
    }

    onApplyCropBtn(bound) {
        this.fp.once('loadImage', (oImage) => {
            let {width,cssWidth} = this.fp.getViewPortInfo().canvas;
            this.setState({
                zoom:cssWidth / width,
                originZoom:cssWidth / width
            });
            this.fp.clearRedoStack();
            this.fp.clearUndoStack();
        });
        let {originInfo, radio} = this.state.cropData;
        bound.left += originInfo.left;
        bound.top += originInfo.top;
        Object.keys(bound).forEach(key => {
            bound[key] = bound[key] / radio;
        });
        this.fp.endCropByBoundInfo(bound);
        this.fp.endAll();
        this.resetEditorState();
        window.mta('count','apply-crop-click');

    }

    onCancleCropBtn() {
        this.fp.endCropByBoundInfo();
        this.fp.endAll();
        this.resetEditorState();
        window.mta('count','cancle-crop-click');
    }

    onUndoBtn() {
        if (this.fp.getCurrentState() === consts.states.CROP) return;
        if(this.fp.isEmptyUndoStack())return;
        this.fp.undo();
        this.resetEditorState();
        window.mta('count','undo-click');
    }

    onRedoBtn() {
        if (this.fp.getCurrentState() === consts.states.CROP) return;
        if(this.fp.isEmptyRedoStack())return;
        this.fp.redo();
        this.resetEditorState();
        window.mta('count','redo-click');
    }

    onPanBtnClick() {
        if (this.fp.getCurrentState() === consts.states.CROP) return;
        if (this.fp.getCurrentState() === consts.states.PAN) {
            this.fp.endAll();
            this.resetEditorState();
        } else {
            this.setState({
                editState: consts.states.PAN
            });
            this.fp.endAll();
            this.fp.startPan();
        }

    }

    renderArrowMenus(left, top) {
        return (
            <div className="tools-panel" style={{left: left, top: top}}>
                <div className="tools-panel-brush">
                    <div  onClick={this.changeStrokeColor(4, 'arrow')}>
                        <span className={`small-brush ${this.state.arrow.stroke === 4 && 'active'}`}
                             > </span>
                    </div>
                    <div onClick={this.changeStrokeColor(6, 'arrow')}>
                        <span className={`normal-brush ${this.state.arrow.stroke === 6 && 'active'}`}
                              > </span>
                    </div>
                    <div onClick={this.changeStrokeColor(8, 'arrow')}>
                        <span className={`big-brush ${this.state.arrow.stroke === 8 && 'active'}`}
                              > </span>
                    </div>
                </div>
                <span className="tools-panel-divider"> </span>
                <div className="tools-panel-color">
                    <div>
                        <span className={`color red ${this.state.arrow.color === '#FF3440' && 'active'}`}
                              onClick={this.changeEditorColor('#FF3440', 'arrow')}> </span>
                    </div>
                    <div>
                        <span className={`color yellow ${this.state.arrow.color === '#FFCF50' && 'active'}`}
                              onClick={this.changeEditorColor('#FFCF50', 'arrow')}> </span>
                    </div>
                    <div>
                        <span className={`color green ${this.state.arrow.color === '#00A344' && 'active'}`}
                              onClick={this.changeEditorColor('#00A344', 'arrow')}> </span>
                    </div>
                    <div>
                        <span className={`color blue ${this.state.arrow.color === '#0DA9D6' && 'active'}`}
                              onClick={this.changeEditorColor('#0DA9D6', 'arrow')}> </span>
                    </div>
                    <div>
                        <span className={`color grey ${this.state.arrow.color === '#999999' && 'active'}`}
                              onClick={this.changeEditorColor('#999999', 'arrow')}> </span>
                    </div>
                    <div>
                        <span className={`color black ${this.state.arrow.color === '#000000' && 'active'}`}
                              onClick={this.changeEditorColor('#000000', 'arrow')}> </span>
                    </div>
                    <div>
                        <span className={`color white ${this.state.arrow.color === '#ffffff' && 'active'}`}
                              onClick={this.changeEditorColor('#ffffff', 'arrow')}> </span>
                    </div>
                </div>
            </div>
        );
    }

    renderFreeDrawMenus(left, top) {
        return (
            <div className="tools-panel" style={{left: left, top: top}}>
                <div className="tools-panel-brush">
                    <div onClick={this.changeStrokeColor(4, 'freeDraw')}>
                        <span className={`small-brush ${this.state.freeDraw.stroke === 4 && 'active'}`}
                              > </span>
                    </div>
                    <div onClick={this.changeStrokeColor(6, 'freeDraw')}>
                        <span className={`normal-brush ${this.state.freeDraw.stroke === 6 && 'active'}`}
                              > </span>
                    </div>
                    <div onClick={this.changeStrokeColor(8, 'freeDraw')}>
                        <span className={`big-brush ${this.state.freeDraw.stroke === 8 && 'active'}`}
                              > </span>
                    </div>
                </div>
                <span className="tools-panel-divider"> </span>
                <div className="tools-panel-color">
                    <div>
                        <span className={`color red ${this.state.freeDraw.color === '#FF3440' && 'active'}`}
                              onClick={this.changeEditorColor('#FF3440', 'freeDraw')}> </span>
                    </div>
                    <div>
                        <span className={`color yellow ${this.state.freeDraw.color === '#FFCF50' && 'active'}`}
                              onClick={this.changeEditorColor('#FFCF50', 'freeDraw')}> </span>
                    </div>
                    <div>
                        <span className={`color green ${this.state.freeDraw.color === '#00A344' && 'active'}`}
                              onClick={this.changeEditorColor('#00A344', 'freeDraw')}> </span>
                    </div>
                    <div>
                        <span className={`color blue ${this.state.freeDraw.color === '#0DA9D6' && 'active'}`}
                              onClick={this.changeEditorColor('#0DA9D6', 'freeDraw')}> </span>
                    </div>
                    <div>
                        <span className={`color grey ${this.state.freeDraw.color === '#999999' && 'active'}`}
                              onClick={this.changeEditorColor('#999999', 'freeDraw')}> </span>
                    </div>
                    <div>
                        <span className={`color black ${this.state.freeDraw.color === '#000000' && 'active'}`}
                              onClick={this.changeEditorColor('#000000', 'freeDraw')}> </span>
                    </div>
                    <div>
                        <span className={`color white ${this.state.freeDraw.color === '#ffffff' && 'active'}`}
                              onClick={this.changeEditorColor('#ffffff', 'freeDraw')}> </span>
                    </div>
                </div>
            </div>
        );
    }

    renderMosaicMenus(left, top) {
        return (
            <div className="tools-panel" style={{left: left, top: top}}>
                <div className="tools-panel-brush">
                    <div onClick={this.changeStrokeColor(4, 'mosaic')}>
                        <span className={`small-brush ${this.state.mosaic.stroke === 4 && 'active'}`}
                              > </span>
                    </div>
                    <div onClick={this.changeStrokeColor(8, 'mosaic')}>
                        <span className={`normal-brush ${this.state.mosaic.stroke === 8 && 'active'}`}
                              > </span>
                    </div>
                    <div onClick={this.changeStrokeColor(12, 'mosaic')}>
                        <span className={`big-brush ${this.state.mosaic.stroke === 12 && 'active'}`}
                              > </span>
                    </div>
                </div>
            </div>
        );
    }

    renderTextMenus(left, top) {
        return (
            <div className="tools-panel" style={{left: left, top: top}}>
                <div className="tools-panel-color">
                    <div>
                        <span className={`color red ${this.state.text.color === '#FF3440' && 'active'}`}
                              onClick={this.changeEditorColor('#FF3440', 'text')}> </span>
                    </div>
                    <div>
                        <span className={`color yellow ${this.state.text.color === '#FFCF50' && 'active'}`}
                              onClick={this.changeEditorColor('#FFCF50', 'text')}> </span>
                    </div>
                    <div>
                        <span className={`color green ${this.state.text.color === '#00A344' && 'active'}`}
                              onClick={this.changeEditorColor('#00A344', 'text')}> </span>
                    </div>
                    <div>
                        <span className={`color blue ${this.state.text.color === '#0DA9D6' && 'active'}`}
                              onClick={this.changeEditorColor('#0DA9D6', 'text')}> </span>
                    </div>
                    <div>
                        <span className={`color grey ${this.state.text.color === '#999999' && 'active'}`}
                              onClick={this.changeEditorColor('#999999', 'text')}> </span>
                    </div>
                    <div>
                        <span className={`color black ${this.state.text.color === '#000000' && 'active'}`}
                              onClick={this.changeEditorColor('#000000', 'text')}> </span>
                    </div>
                    <div>
                        <span className={`color white ${this.state.text.color === '#ffffff' && 'active'}`}
                              onClick={this.changeEditorColor('#ffffff', 'text')}> </span>
                    </div>
                </div>
            </div>
        );
    }


    renderMenus() {
        let menus = null, left = 0, top = 38, isShow = true;
        if (this.fp && this.state.editState === consts.states.ARROW) {
            left = 20;
            menus = this.renderArrowMenus(left - 150, top);
        } else if (this.fp && this.state.editState === consts.states.FREE_DRAWING) {
            left = 60;
            menus = this.renderFreeDrawMenus(left - 150, top);
        } else if (this.fp && this.state.editState === consts.states.TEXT) {
            left = 98;
            menus = this.renderTextMenus(left - 50, top);
        } else if (this.fp && this.state.editState === consts.states.MOSAIC) {
            left = 135;
            menus = this.renderMosaicMenus(left - 50, top);
        } else {
            menus = null;
            isShow = false;
        }
        return <div>
            {isShow && <div className="triangle-up" style={{left: left, top: top - 4}}></div>}
            {menus}
        </div>;
    }

    changeEditorColor(color, type) {
        return () => {
            this.setState({
                [type]: Object.assign(this.state[type], {color: color})
            });
            this.chageFpBrush(type);
            window.mta('count',`change-${type}-color-click`);
        };
    }

    changeStrokeColor(stroke, type) {
        return () => {
            this.setState({
                [type]: Object.assign(this.state[type], {stroke: stroke})
            });
            this.chageFpBrush(type);
            window.mta('count',`change-${type}-stroke-click`);
        };
    }

    chageFpBrush(type) {
        if (type === 'text') {
            this.fp.changeTextStyle({fill: this.state.text.color});
        } else if (type === 'mosaic') {
            this.fp.startMosaicDrawing({
                dimensions: this.state.mosaic.stroke
            });
        }
        else if (type === 'freeDraw') {
            this.fp.setBrush({
                width: this.state.freeDraw.stroke,
                color: this.state.freeDraw.color
            });
        }
        else if (type === 'arrow') {
            this.fp.startArrowDrawing({
                width: this.state.arrow.stroke,
                color: this.state.arrow.color
            });
        } else {
            console.error('fp change type error');//eslint-disable-line no-console
        }
    }

    handleCloseUploadBubbleFileDialog() {
        this.props.closeUploadBubbleFileDialog();
        this.props.bubbleUploadDialog.uploader.reset();
        eventEmitter.emit('cancleUploadBubbleFile', this.props.bubbleUploadDialog.uploadItem.id);
        eventEmitter.emit('textInput');
    }

    cancelReset() {
        this.setState({
            checkReset:false
        });
    }

    checkReset() {
        if(!this.fp.isEmptyUndoStack() || !this.fp.isEmptyRedoStack() || this.state.zoom !== this.state.originZoom) {
            this.setState({
                checkReset:true
            });
        }
    }
    onWheel(e) {
        if(this.fp && (
                this.fp.getCurrentState() === consts.states.NORMAL ||
                this.fp.getCurrentState() === consts.states.PAN
            )) {
            if(e.deltaY > 0) {
                this.zoomOut();
            }else{
                this.zoomIn();
            }
        }
    }
    render() {
        const {uid, bubbleUploadDialog} = this.props;
        const {editState, cropData, cropArea, zoom,originZoom,checkReset} = this.state;
        const {isShow, filePercentage} = bubbleUploadDialog;
        const group = groupManager.getGroup(uid);
        const notAMember = group.notInGroup();
        const {width: previewWidth, height:previewHeight} = this.getPreviewViewPort();
        const sendBtnCls= classnames({
            'file-button-send':true,
            'sending':notAMember||filePercentage>0||this.sendImgLock
        });
        return (
            <Dialog className="upload-image-dialog"
                    showClose={false}
                    autoHide={false}
                    autoEsc={false}
                    shown={isShow}
                    showMask={true}
                    onCloseClick={this.handleCloseUploadBubbleFileDialog}
                    animation={false}
                    footer={false}
                    header={false}
                    style={this.getDialogViewPort()}>
                <div className="upload-file-image-preview"
                     id="upload-file-image-preview"
                     onWheel={this.onWheel}
                     style={{
                         height: previewHeight,
                         width: previewWidth,
                         visibility: editState !== consts.states.CROP ? 'visible' : 'hidden'
                     }}></div>
                {/*{*/}
                    {/*editState !== consts.states.CROP &&*/}
                    {/*<div className="file-info-progress" style={{top: previewHeight - 8, width: previewWidth}}>*/}
                        {/*/!*<span className="file-info-progress-number">{filePercentage}%</span>*!/*/}
                        {/*<div ref="progressBar" className="file-info-progress-bar"*/}
                             {/*style={{width: `${filePercentage}%`}}></div>*/}
                    {/*</div>*/}
                {/*}*/}
                <div className="btns-wrapper">
                    <div className="zoom-container">
                        <p className="zoom-value">{`${Math.floor(zoom * 100)}%`}</p>
                        <Icon type="image-zoom-in" onClick={this.zoomIn}/>
                        <div className="thumb-divider">
                            <InputRange
                                step={0.2}
                                maxValue={2}
                                minValue={originZoom}
                                value={zoom}
                                onChange={this.changeZoom}/>
                        </div>
                        <Icon type="image-zoom-out" onClick={this.zoomOut}/>
                    </div>
                    <div className="edit-btns-container" ref="editBtnsContainer">
                        <Icon type="image-arrow" className={editState === consts.states.ARROW && 'active'}
                              onClick={this.onArrowBtnClick}  data-title="剪切箭头"/>
                        <Icon type="image-freedrawing"
                              className={editState === consts.states.FREE_DRAWING && 'active'}
                              onClick={this.onFreeDrawBtnClick} data-title="自由绘制"/>
                        <Icon type="image-text" className={editState === consts.states.TEXT && 'active'}
                              onClick={this.onTextBtnClick} data-title="添加文本"/>
                        <Icon type="image-mosaic" className={editState === consts.states.MOSAIC && 'active'}
                              onClick={this.onMosaicBtnClick} data-title="马赛克"/>
                        <Icon type="image-right-rotation" data-title="旋转" onClick={this.onRotationBtnClick}/>
                        <Icon type="image-crop" className={editState === consts.states.CROP && 'active'}
                              onClick={this.onCropBtnClick} data-title="剪切图片"/>
                        <Icon type="image-move" className={editState === consts.states.PAN && 'active'}
                              onClick={this.onPanBtnClick} data-title="移动图片"/>
                        <Icon type="image-undo" data-title="undo"
                              onClick={this.onUndoBtn}/>
                        <Icon type="image-redo" data-title="redo"
                              onClick={this.onRedoBtn}/>
                        <span className="tools-divider"> </span>
                        <span className="edit-button-rest"
                              onClick={this.checkReset}>复原</span>
                        {this.renderMenus()}
                    </div>
                    <div className="dialog-btns-container">
                        <Button className="file-button-cancel" type="default"
                                onClick={this.handleCloseUploadBubbleFileDialog}>取消</Button>
                        <Button className={sendBtnCls} type="primary" ref="sendBtn"  disabled={notAMember}
                                onClick={this.sendImageFunc}>
                            {
                                this.state.sendImgLock?
                                    <span><span><LoadingComponenet type="white" /></span>发送中</span>
                                    :<span>发送</span>
                            }</Button>
                    </div>
                </div>
                {
                    editState === consts.states.CROP &&
                    <div className="upload-file-crop-preview"
                         style={{height: previewHeight, width: previewWidth}}>
                        <Cropper containerHeight={cropArea.height} containerWidth={cropArea.width}
                                 url={cropData.url} imageName={'剪切图片'}
                                 onCrop={this.onApplyCropBtn} onClose={this.onCancleCropBtn}/>
                    </div>
                }
                {
                    checkReset && <Dialog className="check-reset-image"
                                          shown={true}
                                          showMask={true}
                                          onCloseClick={this.cancelReset}
                                          title="确认复原"
                                          footer = {null}
                                          autoHide={false}>
                        <div className="wrapper-txt">
                            <Icon type="warning" /> <span>将会复原到最初状态</span>
                        </div>
                        <div className="wrapper-btn">
                            <Button className=""
                                    type=""
                                    onClick={this.cancelReset}>取消</Button>
                            <Button className=""
                                    type="primary"
                                    onClick={this.onClearBtnClick}>确认</Button>
                        </div>
                    </Dialog>
                }
            </Dialog>
        );
    }
}

```
