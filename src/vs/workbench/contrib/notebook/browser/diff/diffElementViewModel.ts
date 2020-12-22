/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookDiffEditorEventDispatcher } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { CellDiffViewModelLayoutChangeEvent, DiffSide, DIFF_CELL_MARGIN, IDiffElementLayoutInfo } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';
import { IGenericCellViewModel, NotebookLayoutInfo } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditorWidget';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { hash } from 'vs/base/common/hash';
import { format } from 'vs/base/common/jsonFormatter';
import { applyEdits } from 'vs/base/common/jsonEdit';
import { NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { DiffNestedCellViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffNestedCellViewModel';
import { URI } from 'vs/base/common/uri';

export enum PropertyFoldingState {
	Expanded,
	Collapsed
}

type ILayoutInfoDelta0 = { [K in keyof IDiffElementLayoutInfo]?: number; };
interface ILayoutInfoDelta extends ILayoutInfoDelta0 {
	rawOutputHeight?: number;
	recomputeOutput?: boolean;
}

export abstract class DiffElementViewModelBase extends Disposable {
	public metadataFoldingState: PropertyFoldingState;
	public outputFoldingState: PropertyFoldingState;
	protected _layoutInfoEmitter = new Emitter<CellDiffViewModelLayoutChangeEvent>();
	onDidLayoutChange = this._layoutInfoEmitter.event;
	protected _stateChangeEmitter = new Emitter<{ renderOutput: boolean; }>();
	onDidStateChange = this._stateChangeEmitter.event;
	protected _layoutInfo!: IDiffElementLayoutInfo;

	set rawOutputHeight(height: number) {
		this._layout({ rawOutputHeight: height });
	}

	get rawOutputHeight() {
		throw new Error('Use Cell.layoutInfo.rawOutputHeight');
	}

	set outputStatusHeight(height: number) {
		this._layout({ outputStatusHeight: height });
	}

	get outputStatusHeight() {
		throw new Error('Use Cell.layoutInfo.outputStatusHeight');
	}

	set editorHeight(height: number) {
		this._layout({ editorHeight: height });
	}

	get editorHeight() {
		throw new Error('Use Cell.layoutInfo.editorHeight');
	}

	set editorMargin(margin: number) {
		this._layout({ editorMargin: margin });
	}

	get editorMargin() {
		throw new Error('Use Cell.layoutInfo.editorMargin');
	}

	set metadataHeight(height: number) {
		this._layout({ metadataHeight: height });
	}

	get metadataHeight() {
		throw new Error('Use Cell.layoutInfo.metadataHeight');
	}

	private _renderOutput = false;

	set renderOutput(value: boolean) {
		this._renderOutput = value;
		this._layout({ recomputeOutput: true });
		this._stateChangeEmitter.fire({ renderOutput: this._renderOutput });
	}

	get renderOutput() {
		return this._renderOutput;
	}

	get layoutInfo(): IDiffElementLayoutInfo {
		return this._layoutInfo;
	}

	constructor(
		readonly documentTextModel: NotebookTextModel,
		readonly original: DiffNestedCellViewModel | undefined,
		readonly modified: DiffNestedCellViewModel | undefined,
		readonly type: 'unchanged' | 'insert' | 'delete' | 'modified',
		readonly editorEventDispatcher: NotebookDiffEditorEventDispatcher
	) {
		super();
		this._layoutInfo = {
			width: 0,
			editorHeight: 0,
			editorMargin: 0,
			metadataHeight: 0,
			metadataStatusHeight: 25,
			rawOutputHeight: 0,
			outputTotalHeight: 0,
			outputStatusHeight: 25,
			bodyMargin: 32,
			totalHeight: 82
		};

		this.metadataFoldingState = PropertyFoldingState.Collapsed;
		this.outputFoldingState = PropertyFoldingState.Collapsed;

		this._register(this.editorEventDispatcher.onDidChangeLayout(e => {
			this._layoutInfoEmitter.fire({ outerWidth: true });
		}));
	}

	layoutChange() {
		this._layout({ recomputeOutput: true });
	}

	protected _layout(delta: ILayoutInfoDelta) {
		const width = delta.width !== undefined ? delta.width : this._layoutInfo.width;
		const editorHeight = delta.editorHeight !== undefined ? delta.editorHeight : this._layoutInfo.editorHeight;
		const editorMargin = delta.editorMargin !== undefined ? delta.editorMargin : this._layoutInfo.editorMargin;
		const metadataHeight = delta.metadataHeight !== undefined ? delta.metadataHeight : this._layoutInfo.metadataHeight;
		const metadataStatusHeight = delta.metadataStatusHeight !== undefined ? delta.metadataStatusHeight : this._layoutInfo.metadataStatusHeight;
		const rawOutputHeight = delta.rawOutputHeight !== undefined ? delta.rawOutputHeight : this._layoutInfo.rawOutputHeight;
		const outputStatusHeight = delta.outputStatusHeight !== undefined ? delta.outputStatusHeight : this._layoutInfo.outputStatusHeight;
		const bodyMargin = delta.bodyMargin !== undefined ? delta.bodyMargin : this._layoutInfo.bodyMargin;
		const outputHeight = (delta.recomputeOutput || delta.rawOutputHeight !== undefined) ? this._getOutputTotalHeight(rawOutputHeight) : this._layoutInfo.outputTotalHeight;

		const totalHeight = editorHeight
			+ editorMargin
			+ metadataHeight
			+ metadataStatusHeight
			+ outputHeight
			+ outputStatusHeight
			+ bodyMargin;

		const newLayout: IDiffElementLayoutInfo = {
			width: width,
			editorHeight: editorHeight,
			editorMargin: editorMargin,
			metadataHeight: metadataHeight,
			metadataStatusHeight: metadataStatusHeight,
			outputTotalHeight: outputHeight,
			outputStatusHeight: outputStatusHeight,
			bodyMargin: bodyMargin,
			rawOutputHeight: rawOutputHeight,
			totalHeight: totalHeight
		};

		const changeEvent: CellDiffViewModelLayoutChangeEvent = {};

		if (newLayout.width !== this._layoutInfo.width) {
			changeEvent.width = true;
		}

		if (newLayout.editorHeight !== this._layoutInfo.editorHeight) {
			changeEvent.editorHeight = true;
		}

		if (newLayout.editorMargin !== this._layoutInfo.editorMargin) {
			changeEvent.editorMargin = true;
		}

		if (newLayout.metadataHeight !== this._layoutInfo.metadataHeight) {
			changeEvent.metadataHeight = true;
		}

		if (newLayout.metadataStatusHeight !== this._layoutInfo.metadataStatusHeight) {
			changeEvent.metadataStatusHeight = true;
		}

		if (newLayout.outputTotalHeight !== this._layoutInfo.outputTotalHeight) {
			changeEvent.outputTotalHeight = true;
		}

		if (newLayout.outputStatusHeight !== this._layoutInfo.outputStatusHeight) {
			changeEvent.outputStatusHeight = true;
		}

		if (newLayout.bodyMargin !== this._layoutInfo.bodyMargin) {
			changeEvent.bodyMargin = true;
		}

		if (newLayout.totalHeight !== this._layoutInfo.totalHeight) {
			changeEvent.totalHeight = true;
		}

		this._layoutInfo = newLayout;
		this._fireLayoutChangeEvent(changeEvent);
	}

	private _getOutputTotalHeight(rawOutputHeight: number) {
		if (this.outputFoldingState === PropertyFoldingState.Collapsed) {
			return 0;
		}

		if (this.renderOutput) {
			if (this.isOutputEmpty()) {
				// single line;
				return 24;
			}
			return this.getRichOutputTotalHeight();
		} else {
			return rawOutputHeight;
		}
	}

	private _fireLayoutChangeEvent(state: CellDiffViewModelLayoutChangeEvent) {
		this._layoutInfoEmitter.fire(state);
	}

	abstract checkIfOutputsModified(): boolean;
	abstract checkMetadataIfModified(): boolean;
	abstract isOutputEmpty(): boolean;
	abstract getRichOutputTotalHeight(): number;
	abstract getCellByUri(cellUri: URI): IGenericCellViewModel;
	abstract getOutputOffsetInCell(diffSide: DiffSide, index: number): number;
	abstract getOutputOffsetInContainer(diffSide: DiffSide, index: number): number;
	abstract updateOutputHeight(diffSide: DiffSide, index: number, height: number): void;
	abstract getNestedCellViewModel(diffSide: DiffSide): DiffNestedCellViewModel;

	getComputedCellContainerWidth(layoutInfo: NotebookLayoutInfo, diffEditor: boolean, fullWidth: boolean) {
		if (fullWidth) {
			return layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0) - 2;
		}

		return (layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)) / 2 - 18 - 2;
	}
}

export class SideBySideDiffElementViewModel extends DiffElementViewModelBase {
	constructor(
		readonly documentTextModel: NotebookTextModel,
		readonly original: DiffNestedCellViewModel,
		readonly modified: DiffNestedCellViewModel,
		readonly type: 'unchanged' | 'modified',
		readonly editorEventDispatcher: NotebookDiffEditorEventDispatcher
	) {
		super(
			documentTextModel,
			original,
			modified,
			type,
			editorEventDispatcher);

		this.metadataFoldingState = PropertyFoldingState.Collapsed;
		this.outputFoldingState = PropertyFoldingState.Collapsed;

		if (this.checkMetadataIfModified()) {
			this.metadataFoldingState = PropertyFoldingState.Expanded;
		}

		if (this.checkIfOutputsModified()) {
			this.outputFoldingState = PropertyFoldingState.Expanded;
		}

		this._register(this.original.onDidChangeOutputLayout(() => {
			this._layout({ recomputeOutput: true });
		}));

		this._register(this.modified.onDidChangeOutputLayout(() => {
			this._layout({ recomputeOutput: true });
		}));
	}

	checkIfOutputsModified() {
		return !this.documentTextModel.transientOptions.transientOutputs && hash(this.original?.outputs ?? []) !== hash(this.modified?.outputs ?? []);
	}

	checkMetadataIfModified(): boolean {
		return hash(getFormatedMetadataJSON(this.documentTextModel, this.original?.metadata || {}, this.original?.language)) !== hash(getFormatedMetadataJSON(this.documentTextModel, this.modified?.metadata ?? {}, this.modified?.language));
	}

	updateOutputHeight(diffSide: DiffSide, index: number, height: number) {
		if (diffSide === DiffSide.Original) {
			this.original.updateOutputHeight(index, height);
		} else {
			this.modified.updateOutputHeight(index, height);
		}
	}

	getOutputOffsetInContainer(diffSide: DiffSide, index: number) {
		if (diffSide === DiffSide.Original) {
			return this.original.getOutputOffset(index);
		} else {
			return this.modified.getOutputOffset(index);
		}
	}

	getOutputOffsetInCell(diffSide: DiffSide, index: number) {
		const offsetInOutputsContainer = this.getOutputOffsetInContainer(diffSide, index);

		return this._layoutInfo.editorHeight
			+ this._layoutInfo.editorMargin
			+ this._layoutInfo.metadataHeight
			+ this._layoutInfo.metadataStatusHeight
			+ this._layoutInfo.outputStatusHeight
			+ this._layoutInfo.bodyMargin / 2
			+ offsetInOutputsContainer;
	}

	isOutputEmpty() {
		if (this.documentTextModel.transientOptions.transientOutputs) {
			return true;
		}

		if (this.checkIfOutputsModified()) {
			return false;
		}

		// outputs are not changed

		return (this.original?.outputs || []).length === 0;
	}

	getRichOutputTotalHeight() {
		return Math.max(this.original.getOutputTotalHeight(), this.modified.getOutputTotalHeight());
	}

	getNestedCellViewModel(diffSide: DiffSide): DiffNestedCellViewModel {
		throw new Error('Method not implemented.');
	}

	getCellByUri(cellUri: URI): IGenericCellViewModel {
		if (cellUri.toString() === this.original.uri.toString()) {
			return this.original;
		} else {
			return this.modified;
		}
	}
}

export class SingleSideDiffElementViewModel extends DiffElementViewModelBase {
	get cellViewModel() {
		return this.type === 'insert' ? this.modified! : this.original!;
	}

	constructor(
		readonly documentTextModel: NotebookTextModel,
		readonly original: DiffNestedCellViewModel | undefined,
		readonly modified: DiffNestedCellViewModel | undefined,
		readonly type: 'insert' | 'delete',
		readonly editorEventDispatcher: NotebookDiffEditorEventDispatcher
	) {
		super(documentTextModel, original, modified, type, editorEventDispatcher);
		this._register(this.cellViewModel!.onDidChangeOutputLayout(() => {
			this._layout({ recomputeOutput: true });
		}));
	}

	getNestedCellViewModel(diffSide: DiffSide): DiffNestedCellViewModel {
		return this.type === 'insert' ? this.modified! : this.original!;
	}


	checkIfOutputsModified(): boolean {
		return false;
	}

	checkMetadataIfModified(): boolean {
		return false;
	}

	updateOutputHeight(diffSide: DiffSide, index: number, height: number) {
		this.cellViewModel?.updateOutputHeight(index, height);
	}

	getOutputOffsetInContainer(diffSide: DiffSide, index: number) {
		return this.cellViewModel!.getOutputOffset(index);
	}

	getOutputOffsetInCell(diffSide: DiffSide, index: number) {
		const offsetInOutputsContainer = this.cellViewModel!.getOutputOffset(index);

		return this._layoutInfo.editorHeight
			+ this._layoutInfo.editorMargin
			+ this._layoutInfo.metadataHeight
			+ this._layoutInfo.metadataStatusHeight
			+ this._layoutInfo.outputStatusHeight
			+ this._layoutInfo.bodyMargin / 2
			+ offsetInOutputsContainer;
	}

	isOutputEmpty() {
		if (this.documentTextModel.transientOptions.transientOutputs) {
			return true;
		}

		// outputs are not changed

		return (this.original?.outputs || this.modified?.outputs || []).length === 0;
	}

	getRichOutputTotalHeight() {
		return this.cellViewModel?.getOutputTotalHeight() ?? 0;
	}

	getCellByUri(cellUri: URI): IGenericCellViewModel {
		return this.cellViewModel!;
	}
}

export function getFormatedMetadataJSON(documentTextModel: NotebookTextModel, metadata: NotebookCellMetadata, language?: string) {
	let filteredMetadata: { [key: string]: any } = {};

	if (documentTextModel) {
		const transientMetadata = documentTextModel.transientOptions.transientMetadata;

		const keys = new Set([...Object.keys(metadata)]);
		for (let key of keys) {
			if (!(transientMetadata[key as keyof NotebookCellMetadata])
			) {
				filteredMetadata[key] = metadata[key as keyof NotebookCellMetadata];
			}
		}
	} else {
		filteredMetadata = metadata;
	}

	const content = JSON.stringify({
		language,
		...filteredMetadata
	});

	const edits = format(content, undefined, {});
	const metadataSource = applyEdits(content, edits);

	return metadataSource;
}