/**
 * DeckSidePanel — Report Flow Studio's in-tab side panel shell.
 *
 * Mirrors the pattern used by Data Flow's node palette and Story Flow's
 * control sidebar: a panel that lives INSIDE the deck's own tab (not the
 * app's global activity-bar sidebar), collapsible, with a segmented-control
 * tab switcher (reusing the `.seg`/`.seg-item` classes from Story Flow) for
 * Slides / Layouts / Charts. Its Layouts/Charts actions operate on the ACTIVE
 * slide in the Design view.
 */
import { LuLayers, LuLayoutTemplate, LuChartBar, LuImage, LuPanelLeftClose, LuPanelLeftOpen } from 'react-icons/lu';
import SlidesPanel from './panels/SlidesPanel';
import LayoutsPanel from './panels/LayoutsPanel';
import ChartsPanel from './panels/ChartsPanel';
import ImagesPanel from './panels/ImagesPanel';

const TABS = [
    { key: 'slides', icon: LuLayers, title: 'Slides' },
    { key: 'layouts', icon: LuLayoutTemplate, title: 'Layouts' },
    { key: 'charts', icon: LuChartBar, title: 'Charts' },
    { key: 'images', icon: LuImage, title: 'Images' },
];

const DeckSidePanel = ({
    collapsed,
    onToggleCollapsed,
    activePanel,
    onChangePanel,
    slides,
    activeSlideIndex,
    onNavigateSlide,
    onMoveSlide,
    onDeleteSlide,
    onAddSlide,
    onApplyLayout,
    onInsertChart,
    onInsertImage,
}) => {
    if (collapsed) {
        return (
            <div className="deck-side-panel deck-side-panel--collapsed">
                <button className="deck-side-panel-expand" onClick={onToggleCollapsed} title="Show panel">
                    <LuPanelLeftOpen size={16} />
                </button>
            </div>
        );
    }

    const activeLayout = slides?.[activeSlideIndex]?.layout;

    return (
        <div className="deck-side-panel">
            <div className="deck-side-panel-header">
                <div className="seg seg--fill">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                className={`seg-item${activePanel === tab.key ? ' seg-item--active' : ''}`}
                                onClick={() => onChangePanel(tab.key)}
                                title={tab.title}
                            >
                                <Icon size={14} />
                            </button>
                        );
                    })}
                </div>
                <button className="deck-side-panel-collapse" onClick={onToggleCollapsed} title="Hide panel">
                    <LuPanelLeftClose size={16} strokeWidth={2.2} />
                </button>
            </div>

            <div className="deck-side-panel-body">
                {activePanel === 'slides' && (
                    <SlidesPanel
                        slides={slides}
                        activeSlideIndex={activeSlideIndex}
                        onNavigate={onNavigateSlide}
                        onMove={onMoveSlide}
                        onDelete={onDeleteSlide}
                        onAddSlide={onAddSlide}
                    />
                )}
                {activePanel === 'layouts' && <LayoutsPanel onApplyLayout={onApplyLayout} activeLayout={activeLayout} />}
                {activePanel === 'charts' && <ChartsPanel onInsertChart={onInsertChart} />}
                {activePanel === 'images' && <ImagesPanel onInsertImage={onInsertImage} />}
            </div>
        </div>
    );
};

export default DeckSidePanel;
