var AT_CORE_REVIEWERS = [
  'lc-thomasberger',
  'tomgreenfield',
  'brian-learningpool',
  'taylortom',
  'dancgray',
  'canstudios-nicolaw'
];
var FW_CORE_REVIEWERS = [
  'moloko',
  'brian-learningpool',
  'cajones',
  'chris-steele',
  'dancgray',
  'danielghost',
  'dennis-learningpool',
  'lc-thomasberger',
  'oliverfoster',
  'taylortom',
  'tomgreenfield',
  'zenduo'
];
// set to one of the above based on repo
var CORE_REVIEWERS;

$(function() {
  getGHData('orgs/adaptlearning/repos', function(repos) {
    $('body').show();
    renderRepoSelect(repos);
    initKeyFilter();
  });
});

/**
* Data manipulation
*/

function getGHData(urlSuffix, data, dataType, callback) {
  if(typeof data === 'function') {
    callback = data;
    data = undefined;
    dataType = undefined;
  }
  // TODO oauth2
  $.ajax({
    url: 'https://api.github.com/' + urlSuffix,
    type: 'GET',
    data: _.extend({ per_page: 50 }, data),
    dataType: dataType,
    headers: {
      Authorization: 'token 15e160298d59a7a70ac7895c9766b0802735ac99'
    },
    success: callback,
    error: function(jqXHR) {
      if(jqXHR.responseJSON) {
        console.log(jqXHR.responseJSON.message + '\n' + jqXHR.responseJSON.documentation_url);
      }
      else if(jqXHR.statusText) {
        console.log(jqXHR.statusText);
      }
      console.log(jqXHR);
    }
  });
}

function getRepoData(repo, callback) {
  var progress = 0;
  getGHData('repos/adaptlearning/' + repo + '/pulls', function(prsData) {
    progress += 15;
    if(prsData.length === 0) {
      return callback.call(this, []);
    }
    updateProgress(progress);
    var prs = prsData.slice();
    var progressChunk = (100-progress)/prs.length;
    for(var i = 0, count = prs.length, done = 0; i < count; i++) {
      getReviewDataLoop(prs, i, function() {
        progress += progressChunk;
        updateProgress(progress);
        if(++done === prs.length) {
          callback.call(this, prs.sort(sortPRsByReview));
        }
      });
    }
  });
}

// modifies list in place
function getReviewDataLoop(prs, index, callback) {
  var i = Number(index);
  var pr = prs[i];
  $.ajax({
    url: 'https://api.github.com/repos/adaptlearning/' + pr.base.repo.name + '/pulls/' + pr.number + '/reviews',
    type: 'GET',
    headers: {
      Accept : "application/vnd.github.black-cat-preview+json",
      Authorization: 'token 15e160298d59a7a70ac7895c9766b0802735ac99'
    },
    success: function(reviews) {
      if(reviews.length > 0) pr.reviews = organiseReviews(reviews);
      callback.call(this);
    },
    error: console.log
  });
}

function organiseReviews(reviews) {
  if(reviews.length === 0) {
    return;
  }
  var users = [];
  var data = { approved: [], rejected: [], commented: [] };

  for(var i = reviews.length-1; i >= 0; i--) {
    var review = reviews[i];
    // TODO ignore if review user is same as PR user

    // only get latest review from a user
    if(!_.contains(users, review.user.login)) {
      if(review.state === 'APPROVED') data.approved.push(review.user.login);
      if(review.state === 'CHANGES_REQUESTED') data.rejected.push(review.user.login);
    }
    if(review.state === 'COMMENTED' && !_.contains(data.commented, review.user.login)) {
      data.commented.push(review.user.login);
    }
    // record who's done a review
    if(review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') {
      // only take into account the core team
      if(!_.contains(CORE_REVIEWERS, review.user.login)) {
        console.log('#' + review.pull_request_url.split('/').pop(), 'Ignoring', review.user.login + ', not a core reviewer');
        continue;
      }
      users.push(review.user.login);
    }
  }
  if(data.approved.length === 0 && data.rejected.length === 0 && data.commented.length === 0) {
    return;
  }
  return data;
}

function sortPRsByReview(a, b) {
  if(!a.reviews && !b.reviews) {
    return 0;
  }
  if(!a.reviews) {
    return 1;
  }
  if(!b.reviews) {
    return -1;
  }
  if(a.reviews.rejected.length > b.reviews.rejected.length) {
    return -1;
  }
  if(a.reviews.rejected.length < b.reviews.rejected.length) {
    return 1;
  }
  if(a.reviews.approved.length > b.reviews.approved.length) {
    return -1;
  }
  if(a.reviews.approved.length < b.reviews.approved.length) {
    return 1;
  }
  return 0;
}

/**
* Rendering
*/

function initKeyFilter() {
  $('.key .pr-container').click(onKeyFilterClicked);
}

function renderRepoSelect(repos) {
  repos.sort(function(a, b) {
    if(a.name > b.name) return 1;
    if(a.name < b.name) return -1;
    return 0;
  });
  var htmlString = '<option disabled selected>Select a repository</option>';
  for(var i = 0, count = repos.length; i < count; i++) {
    htmlString += '<option value="' + repos[i].name + '">' + repos[i].name + '</option>'
  }
  $('.select .inner')
    .append('<span class="repo-label">Repository:</span>')
    .append('<select id="repoSelect"></select>');

  $('#repoSelect').append(htmlString)
    .change(onSelectChanged);

  $('#repoSelect').val('adapt_authoring');
  onSelectChanged({ currentTarget: $('#repoSelect') });
}

function renderPRsForRepo(repoData) {
  var $inner = $('body > .inner');

  $inner.empty();

  if(repoData.length === 0) {
    $inner.append('<div class="no-prs">No pull requests found.</div>');
  } else {
    $inner.append('<div class="prs"></div>');
    for(var i = 0, count = repoData.length; i < count; i++) renderPR(repoData[i]);
    updateKeyFilters();
  }
}

function renderPR(pr) {
  var template = getPRTemplate(pr);
  var $pr = $(template(pr));

  // open PR's GitHub page on click
  $pr.click(function() { window.open(pr.html_url); });

  if(!pr.reviews) {
    $pr.addClass('no-reviews');
  } else {
    // to show number of +1s
    var icons = ' ';
    for(var i = 0, count = pr.reviews.approved.length; i < count; i++)
      icons += '<span class="approved">&#10004;</span>';
    for(var i = 0, count = pr.reviews.rejected.length; i < count; i++)
      icons += '<span class="rejected">&#10005;</span>';

    $('.title', $pr).append('<span class="icons">' + icons + '</span>');

    if(pr.reviews.approved.length === 3) $pr.addClass('approved');
    if(pr.reviews.rejected.length > 0) $pr.addClass('rejected');
    if(pr.reviews.commented.length > 0) $pr.addClass('commented');
  }

  $('.prs').append($pr);
}

function getPRTemplate(pr) {
  return _.template(
    '<div class="pr <%- number%>">' +
      '<div class="inner">' +
        '<div class="title">#<%- number %>: <%- title %> <div class="author">by <span class="author"><%- user.login%></span></div></div>' +
        '<div class="body"><%- body %></div>' +
        getReviewHTMLForPR(pr) +
      '</div>' +
    '</div>'
  );
}

function getReviewHTMLForPR(pr) {
  var htmlString = '';
  if(pr.reviews) {
    htmlString += '<div class="reviews">';
    if(pr.reviews.approved.length > 0) {
      htmlString += '<div><b class="approved">Approved by</b>: ' + pr.reviews.approved.join(', ') + '</div>';
    }
    if(pr.reviews.rejected.length > 0) {
      htmlString += '<div><b class="rejected">Rejected by</b>: ' + pr.reviews.rejected.join(', ') + '</div>';
    }
    if(pr.reviews.commented.length > 0) {
      htmlString += '<div><b class="commented">Comments</b>: ' + pr.reviews.commented.join(', ') + '</div>';
    }
    htmlString += '</div>';
  }
  return htmlString;
}

function updateProgress(newProgress) {
  // just in case we're not passed a whole number
  newProgress = Math.round(newProgress);
  $('.loading .bar .inner').css({ width: newProgress + '%' });
  newProgress < 100 ? $('.loading .bar').fadeIn() : $('.loading .bar').fadeOut();
}

function updateReviewersOverlay() {
  var $container = $('.reviewers .overlay');
  $container.empty();
  for(var i = 0, count = CORE_REVIEWERS.length; i < count; i++) {
    $container.append('<div>' + CORE_REVIEWERS[i] + '</div>');
  }
}

function updateKeyFilters() {
  var approved = $('.prs .pr.approved').length;
  $('.key .pr.approved .count').html('(' + approved + ')');

  var rejected = $('.prs .pr.rejected').length;
  $('.key .pr.rejected .count').html('(' + rejected + ')');

  var noReviews = $('.prs .pr.no-reviews').length;
  $('.key .pr.no-reviews .count').html('(' + noReviews + ')');

  $('.key').removeClass('disabled');
}

/**
* Events
*/

function onSelectChanged(event) {
  $('.key').addClass('disabled');

  var repo = $(event.currentTarget).val();

  CORE_REVIEWERS = repo === 'adapt_authoring' ? AT_CORE_REVIEWERS : FW_CORE_REVIEWERS;
  updateReviewersOverlay();

  getRepoData(repo, renderPRsForRepo);
  updateProgress(0);
}

function onKeyFilterClicked(event) {
  $('.prs .pr').hide();
  $(event.currentTarget).toggleClass('enabled');
  // get enabled keys
  var enabled = $('.key .pr-container.enabled .pr');
  var selector = '';
  for(var i = 0, count = enabled.length; i < count; i++) {
    var type = enabled[i].className.replace('enabled', '').replace('pr', '').trim();
    selector += '.prs .pr.' + type + ',';
  }
  if(selector[selector.length-1] === ',') selector = selector.slice(0,-1);
  // show all by default
  $(selector || '.prs .pr').show();
}
