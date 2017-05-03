import {checkRendering} from '../../lib/utils.js';

const usage = `Usage:
var customStarRating = connectStarRating(function render(params, isFirstRendering) {
  // params = {
  //   items,
  //   createURL,
  //   refine,
  //   instantSearchInstance,
  //   hasNoResults,
  //   widgetParams,
  // }
});
search.addWidget(
  customStarRatingI({
    attributeName,
    [ max=5 ],
  })
);
Full documentation available at https://community.algolia.com/instantsearch.js/connectors/connectStarRating.html
`;

/**
 * @typedef {Object} StarRatingItems
 * @property {string} name Name corresponding to the number of stars.
 * @property {string} value Number of stars as string.
 * @property {number} count Count of matched results corresponding to the number of stars.
 * @property {boolean[]} stars Array of length of maximum rating value with stars to display or not.
 * @property {boolean} isRefined Indicates if star rating refinement is applied.
 */

/**
 * @typedef {Object} CustomStarRatingWidgetOptions
 * @property {string} attributeName Name of the attribute for faceting (eg. "free_shipping").
 * @property {number} [max = 5] The maximum rating value.
 */

/**
 * @typedef {Object} StarRatingRenderingOptions
 * @property {StarRatingItems[]} items Possible star ratings the user can apply.
 * @property {function(item.value)} createURL Creates an URL for the next state (takes the item value as parameter).
 * @property {function(item.value)} refine Switch to the next state and do a search (takes the filter value as parameter).
 * @property {boolean} hasNoResults Indicates that the last search contains no results.
 * @property {Object} widgetParams All original `CustomStarRatingWidgetOptions` forwarded to the `renderFn`.
 */

/**
 * **StarRating** connector provides the logic to build a custom widget that will give the user ability to refine search results by clicking on stars.
 * The stars are based on the selected attributeName.
 * @type {Connector}
 * @param {function(StarRatingRenderingOptions, boolean)} renderFn Rendering function for the custom **StarRating** widget.
 * @return {function(CustomStarRatingWidgetOptions)} Re-usable widget factory for a custom **StarRating** widget.
 * @example
 * var $ = window.$;
 * var instantsearch = window.instantsearch;
 *
 * // custom `renderFn` to render the custom StarRating widget
 * function renderFn(StarRatingRenderingOptions, isFirstRendering) {
 *   if (isFirstRendering) {
 *     StarRatingRenderingOptions.widgetParams.containerNode.html('<ul></ul>');
 *   }
 *
 *   StarRatingRenderingOptions.widgetParams.containerNode
 *     .find('li[data-refine-value]')
 *     .each(function() { $(this).off('click'); });
 *
 *   var listHTML = StarRatingRenderingOptions.items.map(function(item) {
 *     return '<li data-refine-value="' + item.value + '">' +
 *       '<a href="' + StarRatingRenderingOptions.createURL(item.value) + '">' +
 *       item.stars.map(function(star) { return star === false ? '☆' : '★'; }).join(' ') +
 *       '& up (' + item.count + ')' +
 *       '</a></li>';
 *   });
 *
 *   StarRatingRenderingOptions.widgetParams.containerNode
 *     .find('ul')
 *     .html(listHTML);
 *
 *   StarRatingRenderingOptions.widgetParams.containerNode
 *     .find('li[data-refine-value]')
 *     .each(function() {
 *       $(this).on('click', function(event) {
 *         event.preventDefault();
 *         event.stopPropagation();
 *
 *         StarRatingRenderingOptions.refine($(this).data('refine-value'));
 *       });
 *     });
 * }
 *
 * // connect `renderFn` to StarRating logic
 * var customStarRating = instantsearch.connectors.connectStarRating(renderFn);
 *
 * // mount widget on the page
 * search.addWidget(
 *   customStarRating({
 *     containerNode: $('#custom-star-rating-container'),
 *     attributeName: 'rating',
 *     max: 5,
 *   })
 * );
 */
export default function connectStarRating(renderFn) {
  checkRendering(renderFn, usage);

  return (widgetParams = {}) => {
    const {
      attributeName,
      max = 5,
    } = widgetParams;

    if (!attributeName) {
      throw new Error(usage);
    }

    return {
      getConfiguration() {
        return {disjunctiveFacets: [attributeName]};
      },

      init({helper, createURL, instantSearchInstance}) {
        this._toggleRefinement = this._toggleRefinement.bind(this, helper);
        this._createURL = state => facetValue => createURL(state.toggleRefinement(attributeName, facetValue));

        renderFn({
          instantSearchInstance,
          items: [],
          hasNoResults: true,
          refine: this._toggleRefinement,
          createURL: this._createURL(helper.state),
          widgetParams,
        }, true);
      },

      render({helper, results, state, instantSearchInstance}) {
        const facetValues = [];
        const allValues = {};
        for (let v = max; v >= 0; --v) {
          allValues[v] = 0;
        }
        results.getFacetValues(attributeName).forEach(facet => {
          const val = Math.round(facet.name);
          if (!val || val > max) {
            return;
          }
          for (let v = val; v >= 1; --v) {
            allValues[v] += facet.count;
          }
        });
        const refinedStar = this._getRefinedStar(helper);
        for (let star = max - 1; star >= 1; --star) {
          const count = allValues[star];
          if (refinedStar && star !== refinedStar && count === 0) {
            // skip count==0 when at least 1 refinement is enabled
            // eslint-disable-next-line no-continue
            continue;
          }
          const stars = [];
          for (let i = 1; i <= max; ++i) {
            stars.push(i <= star);
          }
          facetValues.push({
            stars,
            name: String(star),
            value: String(star),
            count,
            isRefined: refinedStar === star,
          });
        }

        renderFn({
          instantSearchInstance,
          items: facetValues,
          hasNoResults: results.nbHits === 0,
          refine: this._toggleRefinement,
          createURL: this._createURL(state),
          widgetParams,
        }, false);
      },

      _toggleRefinement(helper, facetValue) {
        const isRefined = this._getRefinedStar(helper) === Number(facetValue);
        helper.clearRefinements(attributeName);
        if (!isRefined) {
          for (let val = Number(facetValue); val <= max; ++val) {
            helper.addDisjunctiveFacetRefinement(attributeName, val);
          }
        }
        helper.search();
      },

      _getRefinedStar(helper) {
        let refinedStar = undefined;
        const refinements = helper.getRefinements(attributeName);
        refinements.forEach(r => {
          if (!refinedStar || Number(r.value) < refinedStar) {
            refinedStar = Number(r.value);
          }
        });
        return refinedStar;
      },
    };
  };
}
