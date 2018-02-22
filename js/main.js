var AT_CORE_REVIEWERS = [
  'brian-learningpool',
  'canstudios-louisem',
  'canstudios-nicolaw',
  'canstudios-paulh',
  'dancgray',
  'lc-thomasberger',
  'taylortom',
  'tomgreenfield'
];
var FW_CORE_REVIEWERS = [
  'brian-learningpool',
  'cajones',
  'chris-steele',
  'dancgray',
  'danielghost',
  'dennis-learningpool',
  'lc-thomasberger',
  'moloko',
  'oliverfoster',
  'taylortom',
  'tomgreenfield',
  'zenduo'
];
var STATUSES = {
  Success: 'success',
  Pending: 'pending',
  Error: 'error',
  Failure: 'failure'
};
// set to one of the above based on repo
var CORE_REVIEWERS;
// TODO support this
var REQD_CORE_APPROVALS = 2;
var REQD_APPROVALS = 3;

function getToken() {
  // read-only access to public repos
  return 'c5f9aefd5150e059d7c3353449fe148c01e67b02';
}

$(function() {
  CORE_REVIEWERS = _.uniq(AT_CORE_REVIEWERS.concat(FW_CORE_REVIEWERS));
  updateReviewersOverlay();

  getGHData('orgs/adaptlearning/repos', function(repos) {
    $('body').show();
    renderRepoSelect(repos);

    var locData = window.location.hash.slice(1).split('/');
    var repo = locData[0];
    var milestone = locData[1];
    if(repo) {
      selectRepo(repo);
      if(milestone) {
        $(document).on('prs:render', function() {
          $(document).off('prs:render');
          selectMilestone(milestone);
        });
      }
    }
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
      Authorization: 'token ' + getToken()
    },
    success: callback,
    error: function(jqXHR) {
      var error;
      if(jqXHR.responseJSON) {
        error = jqXHR.responseJSON.message + '\n' + jqXHR.responseJSON.documentation_url;
      }
      else if(jqXHR.statusText) {
        error = jqXHR.statusText;
      }
      throw new Error(error);
    }
  });
}

function getRepoData(repo, callback) {
  var progress = 0;
  var progressChunk = 0;

  getGHData('repos/adaptlearning/' + repo + '/pulls', function(prsData) {
    if(!prsData || prsData.length === 0) {
      return callback.call(this, []);
    }
    getGHData('repos/adaptlearning/' + repo + '/milestones', function(milestoneData) {
      progressChunk = 100/(prsData.length+2);
      // we've already made 2 requests, so don't start at 0
      progress = progressChunk*2;
      updateProgress(progress);

      var prs = prsData.slice();
      var progressChunk = (100-progress)/prs.length;
      for(var i = 0, count = prs.length, done = 0; i < count; i++) {
        getReviewDataLoop(prs, i, function() {
          progress += progressChunk;
          updateProgress(progress);
          if(++done === prs.length) {
            callback.call(this, {
              prs: prs.sort(sortPRsByReview),
              milestones: milestoneData
            });
          }
        });
      }
    });
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
      Authorization: 'token ' + getToken()
    },
    success: function(reviews) {
      $.ajax({
        url: pr.statuses_url,
        type: 'GET',
        headers: {
          Accept : "application/vnd.github.black-cat-preview+json",
          Authorization: 'token ' + getToken()
        },
        success: function(statuses) {
          getGHData('repos/' + pr.head.repo.full_name + '/commits/' + pr.head.sha, function(commitData) {
            pr.latestCommit = commitData;
            pr.status = statuses.length && statuses[0];
            if(reviews.length > 0) pr.reviews = organiseReviews(pr, reviews);
            callback.call(this);
          });
        },
        error: console.log
      });
    },
    error: console.log
  });
}

function organiseReviews(pr, reviews) {
  if(reviews.length === 0) {
    return;
  }
  var lastCommitDate = new Date(pr.latestCommit.commit.author.date);
  var users = [];
  var data = { approved: [], rejected: [], commented: [] };

  for(var i = reviews.length-1; i >= 0; i--) {
    var review = reviews[i];
    // ignore if review user is same as PR user
    if(review.user.login === pr.user.login) {
      continue;
    }
    // ignore any reviews before the last commit
    if(new Date(review.submitted_at) < lastCommitDate) {
      continue;
    }
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

/**
* Prioritises like so:
* 1. Mergable PRs come top
* 2. Rejected PRs
* 3. PRs with most approvals
* 4. Reviewed PRs
* 5. Un-reviewed PRs
*/
function sortPRsByReview(a, b) {
  // deal with missing reviews
  if(!a.reviews && !b.reviews) return 0;
  if(!a.reviews) return 1;
  if(!b.reviews) return -1;

  var approvedSort = sortByApproved(a, b);
  var rejectedSort = sortByRejected(a, b);
  var canMergeA = a.reviews.approved.length >= REQD_APPROVALS;
  var canMergeB = b.reviews.approved.length >= REQD_APPROVALS;
  // deal with mergeable PRs
  if(canMergeA || canMergeB) return approvedSort;
  // deal with the rest
  return rejectedSort || approvedSort || 0;
}

function sortByApproved(a, b) {
  if(a.reviews.approved.length > b.reviews.approved.length) return -1;
  if(a.reviews.approved.length < b.reviews.approved.length) return 1;
  return 0;
}

function sortByRejected(a, b) {
  if(a.reviews.rejected.length > b.reviews.rejected.length) return -1;
  if(a.reviews.rejected.length < b.reviews.rejected.length) return 1;
  return 0;
}

/**
* Rendering
*/

function initKeyFilter() {
  $('.key .pr-container').click(filterPRs);
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
    .append('<span class="repo-label select-label">Repository:</span>')
    .append('<select id="repoSelect"></select>');

  $('#repoSelect').append(htmlString)
    .change(onSelectChanged);
}

function rendermilestonesSelect(milestones) {
  if(!milestones || milestones.length === 0) {
    $('#milestoneSelect').remove();
    $('.milestone-label').remove();
    return;
  }

  var htmlString = '<option disabled selected>Select a milestone</option>' +
    '<option value="">All</option>';

  if($('#milestoneSelect').length === 0) {
    $('.select .inner')
    .append('<span class="milestone-label select-label">Filter by milestone:</span>')
    .append('<select id="milestoneSelect"></select>');
  } else {
    $('#milestoneSelect').empty();
  }

  for(var i = 0, count = milestones.length; i < count; i++) {
    htmlString += '<option value="' + milestones[i].id + '" title="' + milestones[i].description + '">' + milestones[i].title + '</option>'
  }

  $('#milestoneSelect')
    .append(htmlString)
    .change(filterPRs);

  $(document).trigger('milestone:render');
}

function renderPRsForRepo(repoData) {
  var $inner = $('body > .inner');

  if(!repoData || repoData.length === 0) {
    $inner.append('<div class="no-prs">No pull requests found.</div>');
  } else {
    $inner.append('<div class="prs"></div>');
    for(var i = 0, count = repoData.length; i < count; i++) renderPR(repoData[i]);
    // updateKeyFilters();
  }
  $(document).trigger('prs:render');
}

function renderPR(pr) {
  var template = getPRTemplate(pr);
  var $pr = $(template(pr));
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

    if(pr.status) {
      var statusMsg = 'checks ';
      switch(pr.status.state) {
        case STATUSES.Pending:
          statusMsg += 'in progress';
          break;
        case STATUSES.Success:
          statusMsg += 'passed';
          break;
        case STATUSES.Error:
          statusMsg += 'errored';
          break;
        case STATUSES.Failure:
          statusMsg += 'failed';
          break;
      }
      $('.title', $pr).append('<a href="' + pr.status.target_url + '" class="status ' + pr.status.state + '">' + statusMsg + '</a>');
    }

    if(pr.reviews.approved.length >= REQD_APPROVALS) $pr.addClass('approved');
    if(pr.reviews.rejected.length > 0) $pr.addClass('rejected');
    if(pr.reviews.commented.length > 0) $pr.addClass('commented');
  }
  // add sone event listeners
  $('a.patch', $pr).click(onPRChildButtonClicked);
  $('a.status', $pr).click(onPRChildButtonClicked);
  $pr.click(onPRButtonClicked);

  $('.prs').append($pr);
}

function getPRTemplate(pr) {
  return _.template(
    '<div class="pr <%- number%>" data-href="<%= html_url %>" data-milestone="<%- milestone && milestone.id || null %>">' +
      '<div class="inner">' +
        '<div class="title">#<%- number %> to <%- base.ref %>: <%- title %> <div class="author">by <span class="author"><%- user.login%></span></div></div>' +
        '<div class="body"><%- body %></div>' +
        getReviewHTMLForPR(pr) +
        '<a class="patch" href="' + pr.patch_url + '">View patch</a>' +
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
  var approved = $('.prs .pr.approved:visible').length;
  $('.key .pr.approved .count').html('(' + approved + ')');

  var rejected = $('.prs .pr.rejected:visible').length;
  $('.key .pr.rejected .count').html('(' + rejected + ')');

  var noReviews = $('.prs .pr.no-reviews:visible').length;
  $('.key .pr.no-reviews .count').html('(' + noReviews + ')');

  $('.key').removeClass('disabled');
}

function filterPRs(event) {
  $('.prs .pr').hide();
  // it's a key button
  if(!$(event.currentTarget).attr('data-href')) {
    $(event.currentTarget).toggleClass('enabled');
  }
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

  var milestone = $('#milestoneSelect').val();

  updateHash($('#repoSelect').val(), milestone);

  if(!milestone) return;

  // now filter by milestone
  var prs = $('.prs .pr');
  for(var i = 0, count = prs.length; i < count; i++) {
    var $pr = $(prs[i]);
    if($pr.attr('data-milestone') !== milestone) $pr.hide();
  }
}

function selectRepo(repoName) {
  $('#repoSelect').val(repoName);
  if(!$('#repoSelect').val()) {
    alert('Cannot load PRs for unknown repository: ' + repoName);
  }
  onSelectChanged({ currentTarget: $('#repoSelect') });
}

function selectMilestone(milestoneId) {
  if(!milestoneId) return;
  $('#milestoneSelect').val(milestoneId);
  if(!$('#milestoneSelect').val()) {
    alert('Unknown milestone, showing all milestones.');
    $('#milestoneSelect').val('');
  }
  filterPRs({ currentTarget: $('#milestoneSelect') });
}

function updateHash(repo, milestone) {
  if(!repo) return;
  window.location.hash = '#' + repo + (milestone ? '/' + milestone : '');
}

/**
* Events
*/
function onSelectChanged(event) {
  $('body > .inner').empty();

  $('.key').addClass('disabled');

  var repo = $(event.currentTarget).val();

  updateHash(repo);

  CORE_REVIEWERS = repo === 'adapt_authoring' ? AT_CORE_REVIEWERS : FW_CORE_REVIEWERS;
  updateReviewersOverlay();

  getRepoData(repo, function(repoData) {
    rendermilestonesSelect(repoData.milestones);
    renderPRsForRepo(repoData.prs);
    updateKeyFilters();
  });
  updateProgress(0);
}

function onPRChildButtonClicked(event) {
  event.preventDefault();
  event.stopPropagation();
  window.open($(event.currentTarget).attr('href'));
}

// open PR's GitHub page on click
function onPRButtonClicked(event) {
  window.open($(event.currentTarget).attr('data-href'));
}
