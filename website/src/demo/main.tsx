import React, { Component } from 'react';
import classnames from 'classnames';
import {
  ZoomOut,
  ZoomIn,
  ArrowRight,
  PenTool,
  Type,
  Grid3x3,
  RotateCw,
  Crop,
  Hand,
  RotateCcw,
  Copy,
  AlertCircle,
  Trash2,
  Check,
  X,
  Download
} from 'lucide-react';

import { FabricPhoto, consts } from '../../../src/index';

declare const $: any;

interface EditorState {
  editState: string;
  arrow: {
    color: string;
    stroke: number;
  };
  freeDraw: {
    color: string;
    stroke: number;
  };
  text: {
    color: string;
  };
  mosaic: {
    stroke: string;
  };
  zoom: number;
  showColorPicker: boolean;
  selectedColor: string;
  activeTool: string | null;
}

export default class WrapContainer extends Component<Record<string, never>, EditorState> {
  private fp: any;

  constructor(props: Record<string, never>) {
    super(props);
    this.state = {
      editState: consts.states.NORMAL,
      arrow: {
        color: '#FF3440',
        stroke: 4
      },
      freeDraw: {
        color: '#FF3440',
        stroke: 4
      },
      text: {
        color: '#FF3440'
      },
      mosaic: {
        stroke: '#FF3440'
      },
      zoom: 1,
      showColorPicker: false,
      selectedColor: '#FF3440',
      activeTool: null
    };
  }

  componentDidMount() {
    (window as any).fabricPhoto = (this.fp = new FabricPhoto('#upload-file-image-preview', {
      cssMaxWidth: 700,
      cssMaxHeight: 400
    }));
    this.fp.once('loadImage', (_oImage: any) => {
      this.fp.clearUndoStack();
    });
    this.fp.loadImageFromURL('/images/demo.jpeg', 'image name');
    this.fp.on('selectObject', (obj: any) => {
      if (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'triangle') {
        this.setState({
          editState: consts.states.SHAPE
        });
        this.activateShapeMode();
      } else if (obj.type === 'text') {
        this.setState({
          editState: consts.states.TEXT
        });
        this.activateTextMode();
      }
    });
    this.fp.on('activateText', (obj: any) => {
      if (obj.type === 'new') {
        console.log('--activateText--new-->', obj);
        this.fp.addText('双击编辑', {
          styles: {
            fill: this.state.text.color,
            fontSize: 50
          },
          position: obj.originPosition
        });
      }
    });
    this.fp.on({
      emptyUndoStack: () => {},
      emptyRedoStack: () => {},
      pushUndoStack: () => {},
      pushRedoStack: () => {},
      endCropping: () => {},
      endFreeDrawing: () => {},
      adjustObject: (obj: any, type: any) => {
        if (obj.type === 'text' && type === 'scale') {
          // Handle text scaling
        }
      }
    });
  }

  componentWillUnmount() {
    if (this.fp) {
      this.fp.destory();
      this.fp = null;
      $('#upload-file-image-preview-paper').empty();
    }
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

  getWindowViewPort() {
    return {
      height: $(window).height(),
      width: $(window).width()
    };
  }

  resetEditorState() {
    this.setState({
      editState: consts.states.NORMAL,
      activeTool: null
    });
  }

  onArrowBtnClick() {
    this.fp.endAll();
    if (this.state.editState === consts.states.ARROW) {
      this.resetEditorState();
    } else {
      this.setState({
        editState: consts.states.ARROW,
        activeTool: 'arrow'
      });
      this.fp.startArrowDrawing({
        width: this.state.arrow.stroke,
        color: this.state.arrow.color
      });
    }
  }

  onFreeDrawBtnClick() {
    this.fp.endAll();
    if (this.state.editState === consts.states.FREE_DRAWING) {
      this.resetEditorState();
    } else {
      this.setState({
        editState: consts.states.FREE_DRAWING,
        activeTool: 'pen'
      });
      this.fp.startFreeDrawing({
        width: this.state.freeDraw.stroke,
        color: this.state.freeDraw.color
      });
    }
  }

  onMosaicBtnClick() {
    this.fp.endAll();
    if (this.state.editState === consts.states.MOSAIC) {
      this.resetEditorState();
    } else {
      this.setState({
        editState: consts.states.MOSAIC,
        activeTool: 'mosaic'
      });
      this.fp.startMosaicDrawing({
        dimensions: this.state.mosaic.stroke
      });
    }
  }

  onTextBtnClick() {
    if (this.fp.getCurrentState() === consts.states.TEXT) {
      this.fp.endAll();
      this.resetEditorState();
    } else {
      this.setState({
        editState: consts.states.TEXT,
        activeTool: 'text'
      });
      this.fp.endAll();
      this.fp.startTextMode();
    }
  }

  onRotationBtnClick() {
    this.fp.endAll();
    this.fp.rotate(90);
    this.resetEditorState();
  }

  onCropBtnClick() {
    this.fp.startCropping();
    this.setState({
      activeTool: 'crop'
    });
  }

  onClearBtnClick() {
    this.resetEditorState();
    this.fp.clearObjects();
  }

  onApplyCropBtn = () => {
    this.fp.endCropping(true);
    this.setState({ activeTool: null });
  };

  onCancleCropBtn = () => {
    this.fp.endCropping();
    this.setState({ activeTool: null });
  };

  onUndoBtn() {
    this.fp.undo();
  }

  onRedoBtn() {
    this.fp.redo();
  }

  onPanBtnClick() {
    this.fp.endAll();
    this.fp.startPan();
    this.setState({
      activeTool: 'pan'
    });
  }

  zoomOut = () => {
    let nextZoom = this.fp.getZoom() + 0.2;
    if (nextZoom > 4) {
      return;
    }
    this.fp.setZoom(nextZoom);
    this.setState({ zoom: nextZoom });
  };

  zoomIn = () => {
    let nextZoom = this.fp.getZoom() - 0.2;
    if (nextZoom < 1) {
      return;
    }
    this.fp.setZoom(nextZoom);
    this.setState({ zoom: nextZoom });
  };

  changeColor = (color: string) => {
    this.setState({
      selectedColor: color,
      arrow: { ...this.state.arrow, color },
      freeDraw: { ...this.state.freeDraw, color },
      text: { ...this.state.text, color }
    });
  };

  onURL() {
    const url = this.fp.toDataURL('image/png');
    console.log('Image URL:', url);
  }

  renderColorPicker() {
    if (this.state.editState === consts.states.NORMAL) return null;

    const colors = [
      { name: 'red', value: '#FF3440', label: 'Red' },
      { name: 'yellow', value: '#FFCF50', label: 'Yellow' },
      { name: 'green', value: '#00A344', label: 'Green' },
      { name: 'blue', value: '#0DA9D6', label: 'Blue' },
      { name: 'grey', value: '#999999', label: 'Grey' },
      { name: 'black', value: '#000000', label: 'Black' },
      { name: 'white', value: '#FFFFFF', label: 'White' }
    ];

    return (
      <div className="tools-panel bottom-20 left-1/2 transform -translate-x-1/2">
        <div className="tools-panel-color gap-4 p-3">
          {colors.map((color) => (
            <div
              key={color.name}
              className={`color-swatch color-${color.name} ${
                this.state.selectedColor === color.value ? 'active' : ''
              }`}
              onClick={() => this.changeColor(color.value)}
              title={color.label}
            />
          ))}
        </div>
      </div>
    );
  }

  renderToolButton = (icon: React.ReactNode, onClick: () => void, isActive: boolean = false, tooltip: string = '') => {
    return (
      <button
        className={`toolbar-btn icon ${isActive ? 'active' : ''}`}
        onClick={onClick}
        title={tooltip}
        type="button"
      >
        {icon}
      </button>
    );
  };

  renderCropTools() {
    if (this.state.activeTool !== 'crop') return null;

    return (
      <div className="tools-panel bottom-20 left-1/2 transform -translate-x-1/2 flex gap-4">
        <button
          onClick={this.onApplyCropBtn}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
        >
          <Check size={18} />
          Apply
        </button>
        <button
          onClick={this.onCancleCropBtn}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
        >
          <X size={18} />
          Cancel
        </button>
      </div>
    );
  }

  render() {
    const isToolActive = (toolName: string) => this.state.activeTool === toolName;

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 sm:p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
              Fabric Photo Editor
            </h1>
            <p className="text-gray-600 flex items-center gap-2">
              <AlertCircle size={18} />
              Modern image editing experience
            </p>
          </div>

          {/* Editor Container */}
          <div className="editor-container">
            {/* Canvas Area */}
            <div className="canvas-wrapper mb-6">
              <div id="upload-file-image-preview" className="upload-file-image-preview" />
            </div>

            {/* Toolbar */}
            <div className="editor-toolbar">
              {/* Main Controls Row */}
              <div className="toolbar-row">
                {/* Zoom Controls */}
                <div className="toolbar-section bg-gray-100 rounded-lg px-2">
                  {this.renderToolButton(<ZoomOut size={20} />, this.zoomIn, false, 'Zoom In')}
                  <span className="zoom-display text-xs">{Math.round(this.state.zoom * 100)}%</span>
                  {this.renderToolButton(<ZoomIn size={20} />, this.zoomOut, false, 'Zoom Out')}
                </div>

                <div className="toolbar-divider" />

                {/* Drawing Tools */}
                <div className="toolbar-section">
                  {this.renderToolButton(
                    <ArrowRight size={20} />,
                    () => this.onArrowBtnClick(),
                    isToolActive('arrow'),
                    'Arrow Tool'
                  )}
                  {this.renderToolButton(
                    <PenTool size={20} />,
                    () => this.onFreeDrawBtnClick(),
                    isToolActive('pen'),
                    'Free Draw'
                  )}
                  {this.renderToolButton(
                    <Type size={20} />,
                    () => this.onTextBtnClick(),
                    isToolActive('text'),
                    'Text Tool'
                  )}
                  {this.renderToolButton(
                    <Grid3x3 size={20} />,
                    () => this.onMosaicBtnClick(),
                    isToolActive('mosaic'),
                    'Mosaic'
                  )}
                </div>

                <div className="toolbar-divider" />

                {/* Transform Tools */}
                <div className="toolbar-section">
                  {this.renderToolButton(
                    <RotateCw size={20} />,
                    () => this.onRotationBtnClick(),
                    false,
                    'Rotate 90°'
                  )}
                  {this.renderToolButton(
                    <Crop size={20} />,
                    () => this.onCropBtnClick(),
                    isToolActive('crop'),
                    'Crop'
                  )}
                  {this.renderToolButton(
                    <Hand size={20} />,
                    () => this.onPanBtnClick(),
                    isToolActive('pan'),
                    'Pan'
                  )}
                </div>

                <div className="toolbar-divider" />

                {/* Edit Controls */}
                <div className="toolbar-section">
                  {this.renderToolButton(
                    <RotateCcw size={20} />,
                    () => this.onUndoBtn(),
                    false,
                    'Undo'
                  )}
                  {this.renderToolButton(
                    <Copy size={20} />,
                    () => this.onRedoBtn(),
                    false,
                    'Redo'
                  )}
                </div>

                <div className="toolbar-divider" />

                {/* Action Buttons */}
                <div className="toolbar-section ml-auto">
                  <button
                    className="toolbar-btn text-only"
                    onClick={() => this.onClearBtnClick()}
                    title="Clear all objects"
                  >
                    <Trash2 size={16} className="mr-1" />
                    Clear
                  </button>
                  <button
                    className="toolbar-btn text-only"
                    onClick={() => this.onURL()}
                    title="Export as PNG"
                  >
                    <Download size={16} className="mr-1" />
                    Export
                  </button>
                </div>
              </div>

              {/* Color Picker Row */}
              {(isToolActive('arrow') || isToolActive('pen') || isToolActive('text') || isToolActive('mosaic')) && (
                <div className="toolbar-row border-t border-gray-200 pt-4">
                  <span className="text-sm font-medium text-gray-700 mr-3">Color:</span>
                  <div className="flex gap-2">
                    {[
                      { value: '#FF3440', label: 'Red' },
                      { value: '#FFCF50', label: 'Yellow' },
                      { value: '#00A344', label: 'Green' },
                      { value: '#0DA9D6', label: 'Blue' },
                      { value: '#999999', label: 'Grey' },
                      { value: '#000000', label: 'Black' },
                      { value: '#FFFFFF', label: 'White' }
                    ].map((color) => (
                      <div
                        key={color.value}
                        className={`color-swatch ${
                          this.state.selectedColor === color.value ? 'active ring-2 ring-blue-400' : ''
                        }`}
                        style={{ backgroundColor: color.value }}
                        onClick={() => this.changeColor(color.value)}
                        title={color.label}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Crop Tools Row */}
              {this.state.activeTool === 'crop' && (
                <div className="toolbar-row border-t border-gray-200 pt-4 gap-4">
                  <button
                    onClick={this.onApplyCropBtn}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
                  >
                    <Check size={18} />
                    Apply Crop
                  </button>
                  <button
                    onClick={this.onCancleCropBtn}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                  >
                    <X size={18} />
                    Cancel Crop
                  </button>
                </div>
              )}
            </div>

            {/* State Indicator */}
            {this.fp && this.state.editState !== consts.states.NORMAL && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                {this.state.editState === consts.states.FREE_DRAWING && 'Drawing mode active'}
                {this.state.editState === consts.states.ARROW && 'Arrow mode active'}
                {this.state.editState === consts.states.MOSAIC && 'Mosaic mode active'}
                {this.state.editState === consts.states.TEXT && 'Text mode active'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
